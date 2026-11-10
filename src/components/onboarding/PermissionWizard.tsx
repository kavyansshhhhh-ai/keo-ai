import { useCallback, useEffect, useState } from "react";
import {
  Bell,
  Camera,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  HelpCircle,
  ShieldCheck,
  Sparkles,
  XCircle,
} from "lucide-react";
import { App as CapApp } from "@capacitor/app";
import { isNativeApp, KeoNative, type NativePermissionState } from "@/services/native/keoNative";
import { checkAllPermissions } from "@/services/permissionManager";

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
  const [showRestrictedHelp, setShowRestrictedHelp] = useState(false);

  const checkAllStatuses = useCallback(async () => {
    try {
      const perms = await checkAllPermissions();
      setNotifState(perms.notifications);
      setCameraState(perms.camera);
      setAccessState(perms.accessibility);
    } catch (err) {
      console.warn("[KEO] Failed to check permission statuses:", err);
    }
  }, []);

  useEffect(() => {
    void checkAllStatuses();
  }, [checkAllStatuses]);

  // Re-check statuses when the window regains focus or the native app resumes (e.g. user returns from Android Settings)
  useEffect(() => {
    const handleFocus = () => {
      void checkAllStatuses();
    };
    window.addEventListener("focus", handleFocus);

    let removeAppState: (() => void) | undefined;
    if (isNativeApp()) {
      CapApp.addListener("appStateChange", ({ isActive }) => {
        if (isActive) void checkAllStatuses();
      }).then((handle) => {
        removeAppState = () => void handle.remove();
      }).catch(() => {});
    }

    return () => {
      window.removeEventListener("focus", handleFocus);
      if (removeAppState) removeAppState();
    };
  }, [checkAllStatuses]);

  // Android hardware Back button integration & web Escape handling
  useEffect(() => {
    if (!isNativeApp()) return;

    let removeHandle: (() => void) | undefined;
    let active = true;

    CapApp.addListener("backButton", ({ canGoBack }) => {
      if (step > 1) {
        setStep((s) => (s - 1) as Step);
      } else {
        if (canGoBack) {
          window.history.back();
        } else {
          void CapApp.exitApp();
        }
      }
    })
      .then((handle) => {
        if (active) {
          removeHandle = () => void handle.remove();
        } else {
          void handle.remove();
        }
      })
      .catch((err) => {
        console.warn("[KEO] backButton listener error:", err);
      });

    return () => {
      active = false;
      if (removeHandle) removeHandle();
    };
  }, [step]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && step > 1) {
        setStep((s) => (s - 1) as Step);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [step]);

  const handleFinish = () => {
    try {
      localStorage.setItem("keo_onboarding_completed", "true");
    } catch (err) {
      console.warn("[KEO] Failed to save onboarding completion state:", err);
    }
    onComplete();
  };

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

  const handleOpenAppDetails = async () => {
    if (isNativeApp()) {
      try {
        await KeoNative.openScreen({ screen: "appDetails" });
      } catch (err) {
        console.warn("[KEO] Failed to open app details:", err);
      }
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Permission Setup Wizard"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-xl p-3 sm:p-6 pb-[calc(1rem+env(safe-area-inset-bottom,0px))] pt-[calc(1rem+env(safe-area-inset-top,0px))] overflow-y-auto"
    >
      <div className="glass-strong relative flex w-full max-w-lg max-h-[calc(100dvh-2rem)] flex-col rounded-3xl border border-cyan-400/30 shadow-2xl shadow-cyan-500/15 overflow-hidden my-auto animate-fade-in">
        {/* Fixed Header */}
        <header className="shrink-0 flex items-center justify-between border-b border-white/10 px-4 py-3 sm:px-6 sm:py-3.5 bg-slate-950/40">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button
                type="button"
                onClick={() => setStep((s) => (s - 1) as Step)}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-white/10 hover:text-white transition-colors"
                title="Go back to previous step"
              >
                <ChevronLeft size={16} />
                <span>Back</span>
              </button>
            )}
            <span className="grid h-7 w-7 place-items-center rounded-lg bg-cyan-400/20 text-cyan-400 font-bold text-xs">
              {step}/5
            </span>
            <span className="text-xs font-semibold text-slate-300 hidden xs:inline">
              {step === 1 && "Welcome"}
              {step === 2 && "Notifications"}
              {step === 3 && "Camera"}
              {step === 4 && "Accessibility"}
              {step === 5 && "Summary"}
            </span>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex gap-1 hidden sm:flex">
              {[1, 2, 3, 4, 5].map((s) => (
                <span
                  key={s}
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    s === step
                      ? "w-5 bg-cyan-400"
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
              className="text-xs font-semibold text-cyan-400 hover:text-cyan-300 underline underline-offset-4 transition-colors"
              title="Skip remaining setup and start chat immediately"
            >
              Skip All &amp; Start Chat
            </button>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6 sm:py-5">
          {/* STEP 1: WELCOME */}
          {step === 1 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/15 text-cyan-400 shadow-lg shadow-cyan-500/10">
                  <Sparkles size={22} />
                </div>
                <div>
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-100">KEO AI Assistant</h2>
                  <p className="text-xs text-cyan-400">Personal AI &amp; Device Automation</p>
                </div>
              </div>

              <p className="text-xs sm:text-sm leading-relaxed text-slate-300">
                Welcome to KEO AI! To help KEO assist you with hands-free device actions, reminders, and automation, we will walk you through a quick setup.
              </p>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs leading-relaxed text-slate-300">
                <span className="font-semibold text-cyan-300">Your Privacy Comes First: </span>
                KEO AI never accesses passwords, OTPs, or financial apps. All permissions are completely optional and can be modified anytime in Settings.
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={handleFinish}
                  className="btn-ghost text-xs text-slate-400 hover:text-slate-200"
                >
                  Skip All &amp; Start Chat
                </button>
                <button
                  type="button"
                  onClick={() => setStep(2)}
                  className="btn-primary flex items-center gap-2 !px-5 !py-2.5 text-xs font-semibold"
                >
                  <span>Continue</span>
                  <ChevronRight size={16} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: NOTIFICATIONS */}
          {step === 2 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/15 text-cyan-400">
                  <Bell size={22} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-100">Notifications</h2>
                  <p className="text-xs text-slate-400">Task alerts &amp; assistant updates</p>
                </div>
              </div>

              <p className="text-xs sm:text-sm leading-relaxed text-slate-300">
                Notification access allows KEO AI to send you task completion updates, reminders, and background execution status.
              </p>

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
                <span className="text-slate-300">Current Status:</span>
                <span className={`font-semibold flex items-center gap-1.5 ${notifState === "granted" ? "text-emerald-400" : "text-amber-400"}`}>
                  {notifState === "granted" ? (
                    <>
                      <CheckCircle2 size={14} /> Allowed
                    </>
                  ) : (
                    <>
                      <XCircle size={14} /> Optional (Not Enabled)
                    </>
                  )}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(3)}
                  className="btn-ghost text-xs"
                >
                  Skip for Now
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleRequestNotif()}
                  className="btn-primary !px-5 !py-2.5 text-xs font-semibold"
                >
                  {notifState === "granted" ? "Continue" : "Allow Notifications"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 3: CAMERA */}
          {step === 3 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/15 text-cyan-400">
                  <Camera size={22} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-100">Camera &amp; Flashlight</h2>
                  <p className="text-xs text-slate-400">Device Hardware Access</p>
                </div>
              </div>

              <p className="text-xs sm:text-sm leading-relaxed text-slate-300">
                Camera access allows KEO to toggle your device flashlight and open camera features on voice or chat command. KEO never activates the camera without your explicit instruction.
              </p>

              <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
                <span className="text-slate-300">Current Status:</span>
                <span className={`font-semibold flex items-center gap-1.5 ${cameraState === "granted" ? "text-emerald-400" : "text-amber-400"}`}>
                  {cameraState === "granted" ? (
                    <>
                      <CheckCircle2 size={14} /> Allowed
                    </>
                  ) : (
                    <>
                      <XCircle size={14} /> Optional (Not Enabled)
                    </>
                  )}
                </span>
              </div>

              <div className="mt-2 flex items-center justify-between gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="btn-ghost text-xs"
                >
                  Skip for Now
                </button>
                <button
                  type="button"
                  disabled={loading}
                  onClick={() => void handleRequestCamera()}
                  className="btn-primary !px-5 !py-2.5 text-xs font-semibold"
                >
                  {cameraState === "granted" ? "Continue" : "Allow Camera"}
                </button>
              </div>
            </div>
          )}

          {/* STEP 4: ACCESSIBILITY SERVICE (OPTIONAL) */}
          {step === 4 && (
            <div className="flex flex-col gap-3.5 animate-fade-in">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl border border-cyan-400/30 bg-cyan-400/15 text-cyan-400">
                    <Eye size={20} />
                  </div>
                  <div>
                    <h2 className="text-base sm:text-lg font-bold text-slate-100">Accessibility Service</h2>
                    <p className="text-xs text-cyan-400">App Automation Engine (Optional)</p>
                  </div>
                </div>
                <span className="rounded-full bg-cyan-400/10 px-2.5 py-0.5 text-[10px] font-semibold text-cyan-300 border border-cyan-400/20">
                  Optional
                </span>
              </div>

              <p className="text-xs leading-relaxed text-slate-300">
                Enables hands-free app automation (opening WhatsApp, adjusting device settings, navigating buttons).
                <span className="text-slate-400 block mt-0.5 font-medium">
                  AI Chat and Gemini functions work completely without this.
                </span>
              </p>

              <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs">
                <span className="text-slate-300">Service Status:</span>
                <span className={`font-semibold flex items-center gap-1.5 ${accessState === "granted" ? "text-emerald-400" : "text-amber-400"}`}>
                  {accessState === "granted" ? (
                    <>
                      <CheckCircle2 size={14} /> Active &amp; Ready
                    </>
                  ) : (
                    <>
                      <XCircle size={14} /> Disabled (Optional)
                    </>
                  )}
                </span>
              </div>

              {/* Android 13+ Restricted Setting Notice Accordion / Helper */}
              {accessState !== "granted" && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-400/5 p-2.5 text-xs text-amber-200/90">
                  <button
                    type="button"
                    onClick={() => setShowRestrictedHelp((prev) => !prev)}
                    className="flex w-full items-center justify-between text-left font-medium text-amber-300 text-[11px]"
                  >
                    <span className="flex items-center gap-1.5">
                      <HelpCircle size={13} />
                      <span>Android 13+ "Restricted Setting" Fix?</span>
                    </span>
                    <span className="text-[10px] text-amber-400 underline underline-offset-2">
                      {showRestrictedHelp ? "Hide" : "Show Steps"}
                    </span>
                  </button>
                  {showRestrictedHelp && (
                    <p className="mt-1.5 pt-1.5 border-t border-amber-400/15 text-[11px] leading-relaxed text-amber-200/80">
                      If Android displays "Restricted setting": Tap <b>Fix Restricted Setting</b> below, tap the 3 dots (⋮) in the top-right corner of App Info, select <b>"Allow restricted settings"</b>, authenticate, then return to enable Accessibility.
                    </p>
                  )}
                </div>
              )}

              {/* Actions Area */}
              <div className="flex flex-col gap-2 pt-1">
                {accessState !== "granted" ? (
                  <>
                    <button
                      type="button"
                      onClick={() => void handleOpenAccessibilitySettings()}
                      className="btn-primary w-full justify-center !py-2.5 text-xs font-semibold"
                    >
                      1. Enable Accessibility in Settings
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleOpenAppDetails()}
                      className="btn-ghost w-full justify-center !py-2 text-xs border border-white/10 text-amber-300 hover:text-amber-200"
                    >
                      2. Fix Restricted Setting (App Info)
                    </button>

                    {/* PERMANENTLY VISIBLE, PROMINENT SKIP BUTTON - DIRECTLY STARTS CHAT */}
                    <button
                      type="button"
                      data-testid="skip-accessibility-btn"
                      onClick={handleFinish}
                      className="w-full rounded-xl border-2 border-cyan-400/60 bg-cyan-500/15 hover:bg-cyan-500/25 active:scale-[0.98] py-2.5 px-4 text-center text-xs sm:text-sm font-bold text-cyan-300 shadow-md shadow-cyan-500/10 transition-all flex items-center justify-center gap-2 mt-1 cursor-pointer"
                    >
                      <span>Skip for Now &amp; Start Chat</span>
                      <ChevronRight size={16} />
                    </button>

                    <button
                      type="button"
                      onClick={() => setStep(5)}
                      className="text-[11px] text-slate-400 hover:text-slate-200 underline underline-offset-4 self-center pt-0.5"
                    >
                      View Setup Summary →
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleFinish}
                      className="btn-primary w-full justify-center !py-3 text-sm font-bold shadow-lg shadow-cyan-500/20"
                    >
                      Continue &amp; Start Chat
                    </button>
                    <button
                      type="button"
                      onClick={() => setStep(5)}
                      className="btn-ghost w-full justify-center !py-2 text-xs text-slate-400"
                    >
                      View Setup Summary
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* STEP 5: SUMMARY & FINISH */}
          {step === 5 && (
            <div className="flex flex-col gap-4 animate-fade-in">
              <div className="flex items-center gap-3">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-emerald-500/30 bg-emerald-500/15 text-emerald-400">
                  <ShieldCheck size={22} />
                </div>
                <div>
                  <h2 className="text-lg sm:text-xl font-bold text-slate-100">Setup Summary</h2>
                  <p className="text-xs text-slate-400">Permission Overview</p>
                </div>
              </div>

              <div className="flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-3.5 text-xs">
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-300">Notifications:</span>
                  <span className={`font-semibold ${notifState === "granted" ? "text-emerald-400" : "text-slate-400"}`}>
                    {notifState === "granted" ? "Allowed" : "Not Enabled (Optional)"}
                  </span>
                </div>
                <div className="flex items-center justify-between border-b border-white/5 pb-2">
                  <span className="text-slate-300">Camera &amp; Flashlight:</span>
                  <span className={`font-semibold ${cameraState === "granted" ? "text-emerald-400" : "text-slate-400"}`}>
                    {cameraState === "granted" ? "Allowed" : "Not Enabled (Optional)"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-300">Accessibility Service:</span>
                  <span className={`font-semibold ${accessState === "granted" ? "text-emerald-400" : "text-slate-400"}`}>
                    {accessState === "granted" ? "Active" : "Not Enabled (Optional)"}
                  </span>
                </div>
              </div>

              <p className="text-xs leading-relaxed text-slate-400">
                You can review or adjust any of these permissions at any time inside Settings under "Android Permissions &amp; Assistant Setup".
              </p>

              <div className="mt-2 flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setStep(4)}
                  className="btn-ghost text-xs"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleFinish}
                  className="btn-primary !px-6 !py-2.5 text-xs font-bold"
                >
                  Finish Setup &amp; Start Chat
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
