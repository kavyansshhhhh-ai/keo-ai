import { useState, type ReactNode } from "react";
import { ArrowLeft, Bot, Trash2, Volume2 } from "lucide-react";
import { ConfirmDialog } from "@/components/common/Modal";
import { ApiKeyPanel } from "@/components/settings/ApiKeyPanel";
import { checkAIProvider } from "@/services/chatStream";
import { isSpeechOutputSupported } from "@/services/voice";
import { APP_VERSION } from "@/lib/defaults";
import { KeoNative } from "@/services/native/keoNative";
import type { AppSettings, Language, Theme } from "@/types/chat";

interface SettingsScreenProps {
  settings: AppSettings;
  conversationCount: number;
  onUpdate: (patch: Partial<AppSettings>) => Promise<boolean>;
  onClearAll: () => Promise<void>;
  onBack: () => void;
  onOpenWizard?: () => void;
}

const LANGUAGES: { value: Language; label: string }[] = [
  { value: "auto", label: "Auto-detect" },
  { value: "en", label: "English" },
  { value: "hi", label: "Hindi" },
  { value: "hinglish", label: "Hinglish" },
];

const MEMORY_OPTIONS = [
  { value: 10, label: "Short (last 10 messages)" },
  { value: 20, label: "Balanced (last 20 messages)" },
  { value: 40, label: "Long (last 40 messages)" },
];

function Section({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="glass rounded-2xl p-5 sm:p-6">
      <h2 className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-1 text-sm leading-relaxed text-muted">{description}</p>}
      <div className="mt-5 flex flex-col gap-4">{children}</div>
    </section>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {hint && <p className="mt-0.5 text-xs leading-relaxed text-muted">{hint}</p>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  );
}

function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (value: boolean) => void; label: string; disabled?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative h-7 w-12 rounded-full transition disabled:opacity-40 ${checked ? "bg-accent" : "bg-panel/20"}`}
    >
      <span className={`absolute top-0.5 h-6 w-6 rounded-full bg-white shadow transition-transform ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

function Segmented<T extends string | number>({ value, options, onChange, label }: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex flex-wrap rounded-full border border-line/10 bg-panel/5 p-1">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3.5 py-1.5 text-sm transition ${
            value === option.value ? "bg-accent font-medium text-on-accent" : "text-muted hover:text-fg"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

export function SettingsScreen({ settings, conversationCount, onUpdate, onClearAll, onBack, onOpenWizard }: SettingsScreenProps) {
  const [confirmClear, setConfirmClear] = useState(false);
  const [providerStatus, setProviderStatus] = useState<{ ok: boolean; message: string } | null>(null);
  const [checking, setChecking] = useState(false);
  const [permStatus, setPermStatus] = useState<{ accessibility: boolean; notification: boolean; camera: boolean } | null>(null);

  const checkPerms = async () => {
    try {
      const acc = await KeoNative.isAccessibilityEnabled();
      const notif = await KeoNative.checkPermission({ permission: "notifications" });
      const cam = await KeoNative.checkPermission({ permission: "camera" });
      setPermStatus({
        accessibility: acc.enabled,
        notification: notif.state === "granted",
        camera: cam.state === "granted",
      });
    } catch {
      setPermStatus(null);
    }
  };

  const testProvider = async () => {
    setChecking(true);
    setProviderStatus(await checkAIProvider());
    setChecking(false);
  };

  const themeOptions: { value: Theme; label: string }[] = [
    { value: "dark", label: "Dark" },
    { value: "light", label: "Light" },
  ];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 py-6 animate-fade-in sm:px-6 sm:py-10">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onBack} aria-label="Back to chat" className="icon-btn">
          <ArrowLeft size={19} />
        </button>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      </div>

      <Section title="Appearance">
        <Row label="Theme" hint="Dark is designed for OLED screens.">
          <Segmented<Theme>
            label="Theme"
            value={settings.theme}
            options={themeOptions}
            onChange={(theme) => void onUpdate({ theme })}
          />
        </Row>
      </Section>

      <Section title="Android Personal Assistant Setup" description="Configure permissions and accessibility for voice control, device actions, and native UI automation.">
        <Row label="Permission Wizard" hint="Run the step-by-step assistant permission guide.">
          <button
            type="button"
            onClick={() => onOpenWizard ? onOpenWizard() : void checkPerms()}
            className="btn-accent text-xs font-medium !py-2 !px-4"
          >
            Launch Setup Wizard
          </button>
        </Row>
        <Row label="Accessibility Automation Service" hint="Required for KEO Agent to open apps and perform UI actions.">
          <button
            type="button"
            onClick={() => void KeoNative.openScreen({ screen: "accessibility" })}
            className="btn-ghost text-xs !py-1.5 !px-3"
          >
            {permStatus?.accessibility ? "Active" : "Open Android Settings"}
          </button>
        </Row>
      </Section>

      <Section title="Language" description="KEO replies in the language you choose, or matches yours when set to auto-detect.">
        <Row label="Reply language">
          <Segmented<Language>
            label="Reply language"
            value={settings.language}
            options={LANGUAGES}
            onChange={(language) => void onUpdate({ language })}
          />
        </Row>
      </Section>

      <Section
        title="Voice"
        description="Tap the microphone in the chat box to speak to KEO. The 'Hey KEO' wake word needs a native Android service and is not available in the browser yet."
      >
        <Row label="Speak replies aloud" hint={isSpeechOutputSupported() ? "KEO reads its answers out loud." : "Not supported in this browser."}>
          <Toggle
            label="Speak replies aloud"
            checked={settings.speak_replies}
            disabled={!isSpeechOutputSupported()}
            onChange={(speak_replies) => void onUpdate({ speak_replies })}
          />
        </Row>
      </Section>

      <Section title="Gemini API Key" description="Power KEO with your personal Google Gemini API key. Your key is saved strictly on this device and used directly for all AI features.">
        <ApiKeyPanel />
        <Row label="Connection" hint={providerStatus?.message ?? "Verify that your saved key is active and connecting to Google Gemini."}>
          <button type="button" onClick={() => void testProvider()} disabled={checking} className="btn-ghost !px-3.5 !py-2 text-xs">
            <Bot size={15} /> {checking ? "Testing..." : "Test connection"}
          </button>
        </Row>
        {providerStatus && (
          <p className={`text-xs ${providerStatus.ok ? "text-emerald-400" : "text-rose-400"}`} role="status">
            {providerStatus.ok ? "Connected: " : "Not connected: "} {providerStatus.message}
          </p>
        )}
      </Section>

      <Section title="Memory" description="How much of the earlier conversation KEO keeps in mind for follow-up questions.">
        <Row label="Context length">
          <Segmented<number>
            label="Context length"
            value={settings.context_messages}
            options={MEMORY_OPTIONS.map((o) => ({ value: o.value, label: o.label.split(" (")[0] }))}
            onChange={(context_messages) => void onUpdate({ context_messages })}
          />
        </Row>
      </Section>

      <Section title="Chat history" description={`You have ${conversationCount} saved ${conversationCount === 1 ? "conversation" : "conversations"}.`}>
        <Row label="Clear all conversations" hint="Removes every chat and message. This cannot be undone.">
          <button type="button" onClick={() => setConfirmClear(true)} className="btn-danger">
            <Trash2 size={16} /> Clear history
          </button>
        </Row>
      </Section>

      <Section title="Privacy" description="Your conversations are saved in KEO's database so you can revisit them. KEO does not collect data in the background.">
        <Row label="Microphone" hint="Only used while you tap the microphone button. Nothing is recorded otherwise.">
          <Volume2 size={18} className="text-muted" aria-hidden />
        </Row>
        <Row label="Agent actions" hint="Sending messages and emails always needs your confirmation. KEO never makes purchases or deletes anything.">
          <span className="text-xs text-muted">Always on</span>
        </Row>
      </Section>

      <Section title="About KEO AI">
        <Row label="Assistant">
          <span className="text-sm text-muted">KEO</span>
        </Row>
        <Row label="Version">
          <span className="text-sm text-muted">{APP_VERSION}</span>
        </Row>
      </Section>

      <ConfirmDialog
        open={confirmClear}
        title="Clear all conversations?"
        message="Every conversation and message will be permanently deleted. This cannot be undone."
        confirmLabel="Clear everything"
        onClose={() => setConfirmClear(false)}
        onConfirm={onClearAll}
      />
    </div>
  );
}
