import { useEffect, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import { errorMessage } from "@/lib/errors";

interface ModalProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export function Modal({ open, title, onClose, children }: ModalProps) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm animate-fade-in sm:items-center sm:p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div role="dialog" aria-modal="true" aria-label={title} className="glass-strong w-full max-w-md animate-sheet-up rounded-t-3xl p-6 sm:rounded-3xl">
        <div className="mb-5 flex items-center justify-between">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="icon-btn">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  onConfirm: () => Promise<void>;
  onClose: () => void;
}

export function ConfirmDialog({ open, title, message, confirmLabel, onConfirm, onClose }: ConfirmDialogProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleClose = () => {
    if (busy) return;
    setError(null);
    onClose();
  };

  const handleConfirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await onConfirm();
      onClose();
    } catch (err) {
      setError(errorMessage(err, "The action could not be completed."));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={open} title={title} onClose={handleClose}>
      <p className="text-sm leading-relaxed text-muted">{message}</p>
      {error && (
        <p role="alert" className="mt-4 flex items-start gap-2 rounded-xl bg-error-500/10 p-3 text-sm text-error-300">
          <AlertTriangle size={16} className="mt-0.5 shrink-0" />
          {error}
        </p>
      )}
      <div className="mt-6 flex justify-end gap-3">
        <button type="button" onClick={handleClose} disabled={busy} className="btn-ghost">
          Cancel
        </button>
        <button type="button" onClick={handleConfirm} disabled={busy} className="btn-danger">
          {busy ? "Working..." : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
