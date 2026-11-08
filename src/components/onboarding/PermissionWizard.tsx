import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Camera,
  CheckCircle2,
  ChevronRight,
  Eye,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { isNativeApp, KeoNative, type NativePermissionState } from "@/services/native/keoNative";

interface PermissionWizardProps {
  onComplete: () => void;
}

type Step = 1 | 2 | 3 | 4 | 5;

export function PermissionWizard({ onComplete }: PermissionWizardProps) {
  const [step, setStep] = useState<Step>(1);

  // Real permission statuses
  const [notifState, setNotifState] = useState<NativePermissionState>("prompt");
  const [cameraState, setCameraState] = useState<NativePermissionState>("prompt");
  const [accessState, setAccessState] = useState<NativePermissionState>("prompt");
  const [loading, setLoading] = useState(false);

  const checkAllStatuses = useCallback(async () => {
    if (!isNativeApp()) {
      setNotifState("granted");
      setCameraState("granted");
      setAccessState("denied");
      return;
    }
    try {
      const n = await KeoNative.checkPermission({ permission: "notifications" });
      setNotifState(n.state);
      const c = await KeoNative.checkPermission({ permission: "camera" });
      setCameraState(c.state);
      const a = await KeoNative.isAccessibilityEnabled();
      setAccessState(a.enabled ? "granted" : "denied");
    } catch (err) {
      console.warn("[KEO] Failed to check permission statuses:", err);
    }
  }, []);

  useEffect(() => {
    void checkAllStatuses();
  }, [checkAllStatuses]);

  // Re-check statuses when the window regains focus (e.g. user returns from Android Settings)
  useEffect(() => {
    const handleFocus = () => {
      void checkAllStatuses();
    };
    window.addEventListener("focus", handleFocus);
    return () => {
      window.removeEventListener("focus", handleFocus);
    };
  }, [checkAllStatuses]);

  const handleRequestNotif = async () => {
    if (!isNativeApp()) {
      setStep(3);
      return;
    }
    setLoading(true);
    try {
      const res = await KeoNative.requestPermission({ permission: "notifications" });
      setNotifState(res.state);
    } catch (err) {
      console.warn("[KEO] Notification request error:", err);
    } finally {
      setLoading(false);
      setStep(3);
    }
  };

  const handleRequestCamera = async () => {
    if (!isNativeApp()) {
      setStep(4);
      return;
    }
    setLoading(true);
    try {
      const res = await KeoNative.requestPermission({ permission: "camera" });
      setCameraState(res.state);
    } catch (err) {
      console.warn("[KEO] Camera request error:", err);
    } finally {
      setLoading(false);
      setStep(4);
    }
  };

  const handleOpenAccessibilitySettings = async () => {
    if (isNativeApp()) {
      try {
        await KeoNative.openScreen({ screen: "accessibility" });
      } catch (err) {
        console.warn("[KEO] Failed to open accessibility settings:", err);
      }
    }
  };

  const handleFinish = () => {
    onComplete();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Permission Setup Wizard"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-xl p-4 sm:p-6 animate-fade-in"
    >
      <div className="glass-strong relative flex w-full max-w-lg flex-col overflow-hidden rounded-3xl border border-cyan-400/30 p-6 sm:p-8 shadow-2xl shadow-cyan-500/10">
        {/* Step Indicator & Dismiss */}
        <div className="mb-6 flex items-center justify-between border-b border-white/10 pb-4">
          <div className="flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-xl bg-cyan-400/20 text-cyan-400 font-bold text-xs">
              {step}/5
            </span>
            <span className="text-xs font-semibold text-slate-300">
              {step === 1 && "Welcome to KEO AI"}
              {step === 2 && "Notification Access"}
              {step === 3 && "Camera & Flashlight"}
              {step === 4 && "Accessibility Service"}
              {step === 5 && "Setup Summary"}
            </span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1.5 hidden sm:flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <span
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    s === step
                      ? "w-6 bg-cyan-400"
                      : s < step
                      ? "w-2 bg-emerald-400"
                      : "w-2 bg-white/20"
                  }`}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={handleFinish}
              className="text-xs font-medium text-slate-400 hover:text-slate-100 underline underline-offset-4"
              title="Skip setup and open main chat directly"
            >
              Skip to Chat
            </button>
          </div>
        </div>

        {/* STEP 1: WELCOME */}
        {step === 1 && (
          <div className="flex flex-col gap-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/15 text-cyan-400">
                <Sparkles size={24} />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-slate-100">KEO AI Assistant</h2>
                <p className="text-xs text-cyan-400">Personal AI & Device Automation</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              Welcome to KEO AI! To help KEO operate as your personal Android AI assistant—launching apps, managing device settings, and automating tasks—we will guide you through a quick permission setup.
            </p>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4 text-xs leading-relaxed text-slate-400">
              <span className="font-semibold text-slate-200">Your Privacy Comes First: </span>
              KEO AI never collects passwords, OTPs, or banking details. All permissions are optional and remain under your complete control.
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={() => setStep(2)}
                className="btn-primary flex items-center gap-2 !px-6 !py-3 text-sm"
              >
                <span>Continue</span>
                <ChevronRight size={18} />
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: NOTIFICATIONS */}
        {step === 2 && (
          <div className="flex flex-col gap-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/15 text-cyan-400">
                <Bell size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Notifications</h2>
                <p className="text-xs text-slate-400">Keep up to date with KEO</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              Notification access allows KEO AI to send you task completion updates, reminders, and agent execution alerts.
            </p>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-xs">
              <span className="text-slate-300">Current Status:</span>
              <span className={`font-semibold ${notifState === "granted" ? "text-emerald-400" : "text-amber-400"}`}>
                {notifState === "granted" ? "Granted" : "Not Granted"}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(3)}
                className="btn-ghost text-xs"
              >
                Skip for now
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleRequestNotif()}
                className="btn-primary !px-5 !py-2.5 text-xs"
              >
                {notifState === "granted" ? "Continue" : "Allow Notifications"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: CAMERA */}
        {step === 3 && (
          <div className="flex flex-col gap-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/15 text-cyan-400">
                <Camera size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Camera & Flashlight</h2>
                <p className="text-xs text-slate-400">Device Hardware Access</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              Camera access is used for flashlight controls and launching camera features when requested in Agent Mode. KEO never opens the camera without your instruction.
            </p>
            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-4 text-xs">
              <span className="text-slate-300">Current Status:</span>
              <span className={`font-semibold ${cameraState === "granted" ? "text-emerald-400" : "text-amber-400"}`}>
                {cameraState === "granted" ? "Granted" : "Not Granted"}
              </span>
            </div>
            <div className="mt-4 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setStep(4)}
                className="btn-ghost text-xs"
              >
                Skip for now
              </button>
              <button
                type="button"
                disabled={loading}
                onClick={() => void handleRequestCamera()}
                className="btn-primary !px-5 !py-2.5 text-xs"
              >
                {cameraState === "granted" ? "Continue" : "Allow Camera"}
              </button>
            </div>
          </div>
        )}

        {/* STEP 4: ACCESSIBILITY */}
        {step === 4 && (
          <div className="flex flex-col gap-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/15 text-cyan-400">
                <Eye size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Accessibility Service</h2>
                <p className="text-xs text-cyan-400">App Automation Engine</p>
              </div>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">
              Enabling KEO AI Accessibility Service allows KEO to view accessible labels, buttons, and text fields in supported apps to perform requested actions on your behalf (e.g. preparing WhatsApp messages or navigating settings).
            </p>
            <div className="rounded-2xl border border-cyan-400/20 bg-cyan-400/5 p-4 text-xs leading-relaxed text-slate-300">
              <p className="font-semibold text-slate-100 mb-1">Privacy Guarantee:</p>
              KEO AI never collects passwords, OTPs, or financial credentials. Automation remains 100% visible and under your explicit control.
            </div>

            <div className="rounded-2xl border border-amber-400/20 bg-amber-400/5 p-3 text-xs leading-relaxed text-amber-200/90">
              <p className="font-semibold text-amber-300 mb-1">Android 13+ Restricted Setting Notice:</p>
              If Android says "Restricted setting": Tap <b>Fix Restricted Setting</b> below, tap the 3 dots (⋮) in the top-right corner of App Info, select <b>"Allow restricted settings"</b>, enter your PIN/fingerprint, then return to turn on Accessibility.
            </div>

            <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs">
              <span className="text-slate-300">Accessibility Service Status:</span>
              <span className={`font-semibold flex items-center gap-1.5 ${accessState === "granted" ? "text-emerald-400" : "text-amber-400"}`}>
                {accessState === "granted" ? (
                  <>
                    <CheckCircle2 size={15} /> Enabled
                  </>
                ) : (
                  <>
                    <XCircle size={15} /> Disabled
                  </>
                )}
              </span>
            </div>

            <div className="mt-2 flex flex-col gap-2.5">
              {accessState !== "granted" && (
                <>
                  <button
                    type="button"
                    onClick={() => void handleOpenAccessibilitySettings()}
                    className="btn-primary w-full justify-center !py-2.5 text-xs font-semibold"
                  >
                    1. Enable Accessibility in Android Settings
                  </button>
                  <button
                    type="button"
                    onClick={() => void KeoNative.openScreen({ screen: "appDetails" })}
                    className="btn-ghost w-full justify-center !py-2.5 text-xs border border-white/10 text-amber-300 hover:text-amber-200"
                  >
                    2. Fix Restricted Setting (App Info & 3 Dots)
                  </button>
                </>
              )}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(5)}
                  className="btn-ghost text-xs"
                >
                  {accessState === "granted" ? "Continue" : "Skip for now"}
                </button>
                {accessState === "granted" && (
                  <button
                    type="button"
                    onClick={() => setStep(5)}
                    className="btn-primary !px-5 !py-2 text-xs"
                  >
                    Continue
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* STEP 5: SUMMARY & FINISH */}
        {step === 5 && (
          <div className="flex flex-col gap-5 animate-fade-in">
            <div className="flex items-center gap-3">
              <div className="grid h-12 w-12 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                <ShieldCheck size={24} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-100">Setup Summary</h2>
                <p className="text-xs text-slate-400">Permission Overview</p>
              </div>
            </div>

            <div className="flex flex-col gap-2.5 rounded-2xl border border-white/10 bg-white/5 p-4 text-xs">
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-slate-300">Notifications:</span>
                <span className={`font-semibold ${notifState === "granted" ? "text-emerald-400" : "text-slate-400"}`}>
                  {notifState === "granted" ? "Allowed" : "Not Enabled"}
                </span>
              </div>
              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                <span className="text-slate-300">Camera & Flashlight:</span>
                <span className={`font-semibold ${cameraState === "granted" ? "text-emerald-400" : "text-slate-400"}`}>
                  {cameraState === "granted" ? "Allowed" : "Not Enabled"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-300">Accessibility Service:</span>
                <span className={`font-semibold ${accessState === "granted" ? "text-emerald-400" : "text-slate-400"}`}>
                  {accessState === "granted" ? "Active" : "Not Enabled"}
                </span>
              </div>
            </div>

            <p className="text-xs leading-relaxed text-slate-400">
              You can modify any permission status at any time inside Settings under "Permission Setup".
            </p>

            <div className="mt-4 flex justify-end">
              <button
                type="button"
                onClick={handleFinish}
                className="btn-primary !px-6 !py-3 text-sm"
              >
                Finish Setup & Start Chat
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
