import { isNativeApp, KeoNative, type NativePermissionKind, type NativePermissionState } from "@/services/native/keoNative";

export interface FullPermissionMap {
  microphone: NativePermissionState;
  camera: NativePermissionState;
  notifications: NativePermissionState;
  location: NativePermissionState;
  accessibility: NativePermissionState;
}

export async function checkPermission(permission: NativePermissionKind): Promise<NativePermissionState> {
  if (!isNativeApp()) {
    if (permission === "notifications" || permission === "camera" || permission === "microphone" || permission === "location") {
      try {
        if (typeof navigator !== "undefined" && navigator.permissions) {
          const status = await navigator.permissions.query({ name: permission as PermissionName });
          return status.state === "granted" ? "granted" : status.state === "denied" ? "denied" : "prompt";
        }
      } catch {
        // Fallback for browsers that don't support specific query names
      }
      return "granted";
    }
    return "denied";
  }

  try {
    const res = await KeoNative.checkPermission({ permission });
    return res.state;
  } catch (err) {
    console.warn(`[KEO PermissionManager] Failed to check permission ${permission}:`, err);
    return "prompt";
  }
}

export async function requestPermission(permission: NativePermissionKind): Promise<NativePermissionState> {
  if (!isNativeApp()) {
    return "granted";
  }

  try {
    const res = await KeoNative.requestPermission({ permission });
    return res.state;
  } catch (err) {
    console.warn(`[KEO PermissionManager] Failed to request permission ${permission}:`, err);
    return "denied";
  }
}

export async function checkAllPermissions(): Promise<FullPermissionMap> {
  if (!isNativeApp()) {
    return {
      microphone: "granted",
      camera: "granted",
      notifications: "granted",
      location: "granted",
      accessibility: "denied",
    };
  }

  try {
    const [mic, cam, notif, loc, acc] = await Promise.all([
      checkPermission("microphone"),
      checkPermission("camera"),
      checkPermission("notifications"),
      checkPermission("location"),
      checkPermission("accessibility"),
    ]);

    return {
      microphone: mic,
      camera: cam,
      notifications: notif,
      location: loc,
      accessibility: acc,
    };
  } catch (err) {
    console.warn("[KEO PermissionManager] Failed to check all permissions:", err);
    return {
      microphone: "prompt",
      camera: "prompt",
      notifications: "prompt",
      location: "prompt",
      accessibility: "denied",
    };
  }
}
