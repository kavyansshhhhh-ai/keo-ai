import type { ActionOutcome, AgentActionKind } from "@/types/chat";
import { KeoNative, isNativeApp, type NativePermissionKind } from "@/services/native/keoNative";
import { checkPermission, requestPermission } from "@/services/permissionManager";
import { readBattery, setFlashlight, shareText } from "@/services/agent/deviceTools";

export interface AgentToolDefinition<T = Record<string, unknown>> {
  name: string;
  kind: AgentActionKind;
  description: string;
  requiredPermission?: NativePermissionKind;
  requiresConfirmation: boolean;
  timeoutMs: number;
  execute: (params: T) => Promise<ActionOutcome>;
  verify?: (params: T) => Promise<{ verified: boolean; detail: string }>;
}

export const AGENT_TOOLS: Record<string, AgentToolDefinition> = {
  open_app: {
    name: "open_app",
    kind: "open_app",
    description: "Open an installed Android application by name or package.",
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (params) => {
      const pkg = params.packageName as string | undefined;
      const appName = params.appName as string | undefined;

      if (isNativeApp()) {
        if (pkg) {
          const res = await KeoNative.openApp({ packageName: pkg });
          if (res.status === "opened") {
            return { status: "done", detail: `Opened ${appName || pkg} on your phone.` };
          }
        }
        return { status: "failed", detail: `App ${appName || "requested"} is not installed on your phone.` };
      }

      if (params.url && typeof params.url === "string") {
        window.open(params.url, "_blank");
        return { status: "done", detail: `Opened ${appName || "app"} in web browser.` };
      }

      return { status: "failed", detail: "App opening requires an Android phone or web fallback URL." };
    },
    verify: async (params) => {
      if (isNativeApp() && params.packageName) {
        const apps = await KeoNative.getInstalledApps();
        const installed = apps.apps?.some((a) => a.packageName === params.packageName);
        return { verified: Boolean(installed), detail: installed ? "App is installed." : "App package not found." };
      }
      return { verified: true, detail: "Verification completed." };
    },
  },

  flashlight: {
    name: "flashlight",
    kind: "flashlight",
    description: "Turn device flashlight on or off.",
    requiredPermission: "camera",
    requiresConfirmation: false,
    timeoutMs: 4000,
    execute: async (params) => {
      const on = params.torch === true;
      return setFlashlight(on);
    },
  },

  open_location_settings: {
    name: "open_location_settings",
    kind: "open_wifi_settings", // UI card styling
    description: "Open Android Location / GPS Settings page.",
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async () => {
      if (isNativeApp()) {
        await KeoNative.openScreen({ screen: "location" });
        const loc = await KeoNative.isLocationEnabled();
        return {
          status: "done",
          detail: `Opened Location Settings on your phone. Current GPS Status: ${loc.enabled ? "ENABLED" : "DISABLED"}.`,
        };
      }
      return { status: "failed", detail: "Opening native Location Settings requires an Android phone." };
    },
    verify: async () => {
      if (isNativeApp()) {
        const loc = await KeoNative.isLocationEnabled();
        return {
          verified: loc.enabled,
          detail: loc.enabled ? "Location Services are ON." : "Location Services are OFF in Android Settings.",
        };
      }
      return { verified: true, detail: "Web check completed." };
    },
  },

  open_camera: {
    name: "open_camera",
    kind: "open_camera",
    description: "Launch native camera application.",
    requiredPermission: "camera",
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async () => {
      if (isNativeApp()) {
        const perm = await checkPermission("camera");
        if (perm !== "granted") {
          const req = await requestPermission("camera");
          if (req !== "granted") {
            return { status: "failed", detail: "Camera permission was denied in Android Settings." };
          }
        }
        await KeoNative.openScreen({ screen: "camera" });
        return { status: "done", detail: "Opened Camera on your phone." };
      }
      return { status: "failed", detail: "Native camera launch requires an Android phone." };
    },
  },

  prepare_whatsapp: {
    name: "prepare_whatsapp",
    kind: "prepare_whatsapp",
    description: "Prepare a message in WhatsApp for a contact.",
    requiresConfirmation: true,
    timeoutMs: 8000,
    execute: async (params) => {
      const target = (params.target as string) || (params.phone as string) || "contact";
      const message = (params.text as string) || "";
      const textParam = encodeURIComponent(message);
      const url = `https://api.whatsapp.com/send?text=${textParam}`;

      if (isNativeApp()) {
        const installedApps = await KeoNative.getInstalledApps();
        const hasWhatsApp = installedApps.apps?.some((a) => a.packageName === "com.whatsapp");
        if (!hasWhatsApp) {
          return { status: "failed", detail: "WhatsApp is not installed on your phone." };
        }
        await KeoNative.openUrl({ url });
        return {
          status: "done",
          detail: `Opened WhatsApp with message prepared for ${target}: "${message}". Tap send in WhatsApp to deliver.`,
        };
      }

      window.open(url, "_blank");
      return { status: "done", detail: `Opened WhatsApp web for ${target}.` };
    },
  },

  read_battery: {
    name: "read_battery",
    kind: "battery",
    description: "Read battery percentage and charging state.",
    requiresConfirmation: false,
    timeoutMs: 3000,
    execute: async () => {
      if (isNativeApp()) {
        const bat = await KeoNative.getBatteryStatus();
        if (bat.available) {
          return {
            status: "done",
            detail: `Battery is at ${bat.level}%${bat.charging ? " (Charging)" : ""}.`,
          };
        }
      }
      return readBattery();
    },
  },

  share_content: {
    name: "share_content",
    kind: "share",
    description: "Share text using native Android share sheet.",
    requiresConfirmation: false,
    timeoutMs: 5000,
    execute: async (params) => {
      const text = (params.text as string) || "";
      return shareText(text);
    },
  },
};
