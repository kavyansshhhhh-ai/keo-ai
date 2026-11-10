import { errorMessage } from "@/lib/errors";
import { readBattery, setFlashlight, shareText } from "@/services/agent/deviceTools";
import { parseCommand } from "@/services/agent/parseCommand";
import { routeCommandFast } from "@/services/agent/fastCommandRouter";
import { matchInstalledApps } from "@/services/agent/installedAppsService";
import { KeoNative, isNativeApp, type NativeScreen } from "@/services/native/keoNative";
import type { ActionOutcome, AgentAction } from "@/types/chat";

export type TurnPlan =
  | { type: "reply"; content: string }
  | { type: "action"; action: AgentAction }
  | { type: "multi_action"; actions: AgentAction[] }
  | { type: "ai" };

const ANDROID_ONLY_DETAIL =
  "This action needs an Android phone. It can't run on this device.";

const NATIVE_SCREENS: Partial<Record<string, NativeScreen>> = {
  open_wifi_settings: "wifi",
  open_bluetooth_settings: "bluetooth",
  open_location_settings: "location",
  open_sound_settings: "sound",
  open_notification_settings: "notifications",
  open_battery_settings: "battery",
  open_settings: "settings",
  open_camera: "camera",
  open_gallery: "gallery",
};

function isAndroidDevice(): boolean {
  return /android/i.test(navigator.userAgent);
}

function isSafeWebUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" || parsed.protocol === "mailto:";
  } catch {
    return false;
  }
}

function openLinkInBrowser(action: AgentAction): ActionOutcome {
  if (action.androidIntent && isAndroidDevice()) {
    window.location.href = action.androidIntent;
    return { status: "done", detail: "Opened on your phone." };
  }
  if (action.url && isSafeWebUrl(action.url)) {
    const popup = window.open(action.url, "_blank");
    if (!popup) {
      return { status: "pending", detail: "Your browser blocked the new tab. Tap Open to continue." };
    }
    popup.opener = null;
    return { status: "done", detail: "Opened in a new tab." };
  }
  return { status: "failed", detail: ANDROID_ONLY_DETAIL };
}

async function openInNativeApp(action: AgentAction): Promise<ActionOutcome> {
  try {
    const screen = NATIVE_SCREENS[action.kind];
    if (screen) {
      await KeoNative.openScreen({ screen });
      return { status: "done", detail: "Opened on your phone." };
    }
    if (action.kind === "prepare_whatsapp" || action.kind === "send_whatsapp") {
      const acc = await KeoNative.isAccessibilityEnabled();
      if (!acc.enabled) {
        return {
          status: "failed",
          detail: "KEO AI Accessibility Service is currently disabled. Please enable it in Settings -> Android Personal Assistant Setup.",
        };
      }
      const result = await KeoNative.performAccessibilityAction({
        action: "sendWhatsAppMessage",
        query: action.phone ?? action.target ?? "",
        text: action.text ?? "",
      });
      if (result.success) {
        return { status: "done", detail: result.detail ?? "WhatsApp message prepared on your phone." };
      }
    }
    if (action.androidPackage) {
      const { status } = await KeoNative.openApp({ packageName: action.androidPackage });
      if (status === "opened") return { status: "done", detail: "Opened on your phone." };
    }
    if (action.url && isSafeWebUrl(action.url)) {
      await KeoNative.openUrl({ url: action.url });
      return {
        status: "done",
        detail: action.androidPackage
          ? "The app isn't installed, so I opened it in your browser."
          : "Opened on your phone.",
      };
    }
    return { status: "failed", detail: "KEO couldn't find a way to open that on your phone." };
  } catch (err) {
    return { status: "failed", detail: errorMessage(err, "Your phone couldn't open that.") };
  }
}

// Link actions open before any await in the web path so browsers still treat the tap as a user gesture.
export async function executeAction(action: AgentAction): Promise<ActionOutcome> {
  switch (action.kind) {
    case "flashlight":
      return setFlashlight(action.torch === true);
    case "battery":
      return readBattery();
    case "share":
      return shareText(action.text ?? "");
    default:
      return isNativeApp() ? openInNativeApp(action) : openLinkInBrowser(action);
  }
}

export async function planAgentTurn(text: string): Promise<TurnPlan> {
  // Multi-step agent execution: Check for multi-command sequence delimiters ("then", "and then", "after that", ";")
  const multiDelim = /\s+(?:and\s+then|then|after\s+that|and\s+also|;)\s+/i;
  if (multiDelim.test(text)) {
    const parts = text.split(multiDelim).map((p) => p.trim()).filter(Boolean);
    if (parts.length > 1) {
      const actions: AgentAction[] = [];
      for (const part of parts) {
        const subResult = routeCommandFast(part);
        const parsed = subResult.handledLocally ? subResult.parsed : parseCommand(part);
        if (parsed.type === "action") {
          const draft: AgentAction = { ...parsed.action, status: "pending" };
          if (draft.requiresConfirmation) {
            actions.push(draft);
          } else {
            const outcome = await executeAction(draft);
            actions.push({ ...draft, status: outcome.status, detail: outcome.detail });
            // Handle failures safely: if an auto-executed step fails, halt remaining automated steps
            if (outcome.status === "failed") {
              break;
            }
          }
        }
      }
      if (actions.length > 1) {
        return { type: "multi_action", actions };
      } else if (actions.length === 1) {
        return { type: "action", action: actions[0] };
      }
    }
  }

  const fastResult = routeCommandFast(text);
  let parsed = fastResult.handledLocally ? fastResult.parsed : parseCommand(text);

  // If deterministic parser didn't match, check dynamic installed apps
  if (parsed.type === "none") {
    const isLaunchIntent =
      /\b(open|kholo|khol|kholiye|launch|start|chalu|chalao|chalo|shuru)\b/i.test(text) ||
      text.trim().split(/\s+/).length <= 2;
    if (isLaunchIntent) {
      const match = await matchInstalledApps(text);
      if (match.exact) {
        parsed = {
          type: "action",
          action: {
            kind: "open_app",
            label: `Open ${match.exact.appName}`,
            androidPackage: match.exact.packageName,
            androidIntent: `intent:#Intent;action=android.intent.action.MAIN;category=android.intent.category.LAUNCHER;package=${match.exact.packageName};end`,
            requiresConfirmation: false,
          },
        };
      } else if (match.candidates.length > 1) {
        const names = match.candidates.slice(0, 4).map((c) => c.appName).join(", ");
        return {
          type: "reply",
          content: `I found multiple matching apps: ${names}. Which one would you like me to open?`,
        };
      } else if (match.cleanedTarget.length > 2) {
        return {
          type: "action",
          action: {
            kind: "install_app",
            label: `App "${match.cleanedTarget}" is not installed. Find on Google Play Store?`,
            url: `https://play.google.com/store/search?q=${encodeURIComponent(match.cleanedTarget)}&c=apps`,
            requiresConfirmation: true,
            status: "pending",
          },
        };
      }
    }
  }

  if (parsed.type === "none") return { type: "ai" };
  if (parsed.type === "clarify" || parsed.type === "unsupported") {
    return { type: "reply", content: parsed.message };
  }
  const draft: AgentAction = { ...parsed.action, status: "pending" };
  if (draft.requiresConfirmation) return { type: "action", action: draft };
  const outcome = await executeAction(draft);
  return { type: "action", action: { ...draft, status: outcome.status, detail: outcome.detail } };
}

export async function confirmAction(action: AgentAction): Promise<AgentAction> {
  const outcome = await executeAction(action);
  return { ...action, status: outcome.status, detail: outcome.detail };
}

export async function cancelAction(action: AgentAction): Promise<AgentAction> {
  return { ...action, status: "cancelled", detail: "Cancelled. Nothing was opened." };
}
