import { Capacitor, registerPlugin } from "@capacitor/core";

export type NativeScreen = "wifi" | "bluetooth" | "settings" | "camera" | "appDetails";
export type NativePermissionState = "granted" | "denied" | "prompt" | "prompt-with-rationale";

interface KeoNativePlugin {
  openApp(options: { packageName: string }): Promise<{ status: "opened" | "missing" }>;
  openUrl(options: { url: string }): Promise<void>;
  openScreen(options: { screen: NativeScreen }): Promise<void>;
  setTorch(options: { on: boolean }): Promise<{ supported: boolean }>;
  checkPermission(options: { permission: "microphone" }): Promise<{ state: NativePermissionState }>;
  requestPermission(options: { permission: "microphone" }): Promise<{ state: NativePermissionState }>;
}

export const KeoNative = registerPlugin<KeoNativePlugin>("KeoNative");

export function isNativeApp(): boolean {
  return Capacitor.isNativePlatform();
}
