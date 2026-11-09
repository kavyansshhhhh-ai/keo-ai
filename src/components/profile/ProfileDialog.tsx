import { useEffect, useState } from "react";
import { Modal } from "@/components/common/Modal";
import { errorMessage } from "@/lib/errors";

interface ProfileDialogProps {
  open: boolean;
  onClose: () => void;
  displayName: string;
  conversationCount: number;
  onSave: (name: string) => Promise<void>;
}

export function ProfileDialog({ open, onClose, displayName, conversationCount, onSave }: ProfileDialogProps) {
  const [name, setName] = useState(displayName);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(displayName);
      setError(null);
    }
  }, [open, displayName]);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      await onSave(name.trim());
      onClose();
    } catch (err) {
      setError(errorMessage(err, "Could not save your profile."));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal open={open} title="Profile" onClose={onClose}>
      <div className="flex items-center gap-4">
        <div className="grid h-14 w-14 place-items-center rounded-2xl border border-accent/30 bg-accent/15 font-display text-xl font-semibold text-accent">
          {(name.trim()[0] ?? "K").toUpperCase()}
        </div>
        <div>
          <p className="font-medium">{displayName || "KEO user"}</p>
          <p className="text-sm text-muted">
            {conversationCount} {conversationCount === 1 ? "conversation" : "conversations"} saved
          </p>
        </div>
      </div>
      <form
        className="mt-6 flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        <label className="flex flex-col gap-2 text-sm">
          <span className="text-muted">Your name</span>
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={40}
            autoComplete="name"
            autoCorrect="on"
            autoCapitalize="words"
            spellCheck={true}
            placeholder="How should KEO greet you?"
            className="field"
          />
        </label>
        {error && <p role="alert" className="text-sm text-error-300">{error}</p>}
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className="btn-ghost">
            Cancel
          </button>
          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? "Saving..." : "Save profile"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
