import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeScreen =
  | "accessibility"
  | "notifications"
  | "wifi"
  | "bluetooth"
  | "location"
  | "sound"
  | "battery"
  | "settings"
  | "camera"
  | "gallery"
  | "appDetails";

export type NativePermissionKind = "microphone" | "camera" | "notifications" | "accessibility";
export type NativePermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

export interface InstalledAppInfo {
  packageName: string;
  appName: string;
}

interface KeoNativePlugin {
  getInstalledApps(): Promise<{ apps: InstalledAppInfo[] }>;
  openApp(options: { packageName: string }): Promise<{ status: "opened" | "missing" }>;
  openUrl(options: { url: string }): Promise<void>;
  openScreen(options: { screen: NativeScreen }): Promise<void>;
  getClipboardText(): Promise<{ text: string }>;
  setTorch(options: { on: boolean }): Promise<{ supported: boolean }>;
  getBatteryStatus(): Promise<{ level: number; charging: boolean; available: boolean }>;
  isAccessibilityEnabled(): Promise<{ enabled: boolean }>;
  performAccessibilityAction(options: {
    action: "findAndClick" | "findAndType" | "navigateBack" | "readScreenText" | "sendWhatsAppMessage" | "scrollForward" | "scrollBackward";
    query?: string;
    text?: string;
  }): Promise<{ success: boolean; detail?: string; textList?: string[] }>;
  checkPermission(options: { permission: NativePermissionKind }): Promise<{ state: NativePermissionState }>;
  requestPermission(options: { permission: NativePermissionKind }): Promise<{ state: NativePermissionState }>;
}

export const KeoNative = registerPlugin<KeoNativePlugin>("KeoNative");

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
