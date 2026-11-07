import type { ActionOutcome } from "@/types/chat";
import { errorMessage } from "@/lib/errors";
import { KeoNative, isNativeApp } from "@/services/native/keoNative";

interface BatteryManagerLike {
  level: number;
  charging: boolean;
}

let torchStream: MediaStream | null = null;

function stopTorch(): boolean {
  if (!torchStream) return false;
  torchStream.getTracks().forEach((track) => track.stop());
  torchStream = null;
  return true;
}

function failed(detail: string): ActionOutcome {
  return { status: "failed", detail };
}

function cameraErrorMessage(err: unknown): string {
  const name = err instanceof DOMException ? err.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Camera permission was not granted, so the flashlight stayed off. Try again and tap Allow when asked.";
  }
  if (name === "NotFoundError" || name === "OverconstrainedError") return "No camera was found on this device.";
  if (name === "NotReadableError") return "The camera is busy in another app. Close that app and try again.";
  return "Could not access the camera to control the flashlight.";
}

async function isCameraPermissionBlocked(): Promise<boolean> {
  try {
    const status = await navigator.permissions.query({ name: "camera" as PermissionName });
    return status.state === "denied";
  } catch {
    return false;
  }
}

export async function setFlashlight(on: boolean): Promise<ActionOutcome> {
  if (isNativeApp()) {
    try {
      const { supported } = await KeoNative.setTorch({ on });
      if (!supported) return failed("This phone doesn't have a flashlight.");
      return { status: "done", detail: on ? "Flashlight is on. Ask me to turn it off when you're done." : "Flashlight is off." };
    } catch (err) {
      return failed(errorMessage(err, "The flashlight could not be changed."));
    }
  }

  if (!on) {
    const wasOn = stopTorch();
    return { status: "done", detail: wasOn ? "Flashlight is off." : "Flashlight was already off." };
  }

  if (!navigator.mediaDevices?.getUserMedia) {
    return failed("This browser can't control the flashlight. The KEO Android app is needed for that.");
  }
  if (await isCameraPermissionBlocked()) {
    return failed(
      "Camera permission is blocked, so the flashlight can't turn on. Allow camera access for KEO in your phone's settings, then try again.",
    );
  }

  stopTorch();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" } } });
  } catch (err) {
    return failed(cameraErrorMessage(err));
  }

  const track = stream.getVideoTracks()[0] as MediaStreamTrack | undefined;
  const capabilities = track?.getCapabilities() as (MediaTrackCapabilities & { torch?: boolean }) | undefined;
  if (!track || !capabilities?.torch) {
    stream.getTracks().forEach((t) => t.stop());
    return failed("This phone's camera can't switch on the flashlight in this browser.");
  }

  try {
    await track.applyConstraints({ advanced: [{ torch: true } as MediaTrackConstraintSet] });
  } catch {
    stream.getTracks().forEach((t) => t.stop());
    return failed("The flashlight could not be turned on.");
  }

  torchStream = stream;
  return { status: "done", detail: "Flashlight is on. Ask me to turn it off when you're done." };
}

export async function readBattery(): Promise<ActionOutcome> {
  const nav = navigator as Navigator & { getBattery?: () => Promise<BatteryManagerLike> };
  if (!nav.getBattery) return failed("Battery status isn't available in this browser.");
  try {
    const battery = await nav.getBattery();
    const percent = Math.round(battery.level * 100);
    return { status: "done", detail: `Battery is at ${percent}%${battery.charging ? " and charging" : ""}.` };
  } catch {
    return failed("Could not read the battery status.");
  }
}

export async function shareText(text: string): Promise<ActionOutcome> {
  if (!navigator.share) return failed("Sharing isn't available in this browser.");
  try {
    await navigator.share({ text });
    return { status: "done", detail: "Shared." };
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { status: "cancelled", detail: "Sharing was cancelled." };
    }
    return failed("Could not open the share sheet.");
  }
}
