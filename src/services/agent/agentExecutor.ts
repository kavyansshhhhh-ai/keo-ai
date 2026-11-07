import { errorMessage } from "@/lib/errors";
import { readBattery, setFlashlight, shareText } from "@/services/agent/deviceTools";
import { parseCommand } from "@/services/agent/parseCommand";
import { KeoNative, isNativeApp, type NativeScreen } from "@/services/native/keoNative";
import type { ActionOutcome, AgentAction, AgentActionKind } from "@/types/chat";

export type TurnPlan =
  | { type: "reply"; content: string }
  | { type: "action"; action: AgentAction }
  | { type: "ai" };

const ANDROID_ONLY_DETAIL =
  "This action needs an Android phone. It can't run on this device.";

const NATIVE_SCREENS: Partial<Record<AgentActionKind, NativeScreen>> = {
  open_wifi_settings: "wifi",
  open_bluetooth_settings: "bluetooth",
  open_settings: "settings",
  open_camera: "camera",
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
  const parsed = parseCommand(text);
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
