import {
  AlarmClock,
  Battery,
  Bluetooth,
  Camera,
  Check,
  Download,
  ExternalLink,
  Flashlight,
  Mail,
  MapPin,
  MessageSquare,
  Search,
  Settings,
  Share2,
  Wifi,
  X,
  type LucideIcon,
} from "lucide-react";
import type { AgentAction, AgentActionKind } from "@/types/chat";

const ICONS: Record<AgentActionKind, LucideIcon> = {
  open_app: ExternalLink,
  search: Search,
  navigate: MapPin,
  set_alarm: AlarmClock,
  open_camera: Camera,
  open_settings: Settings,
  open_wifi_settings: Wifi,
  open_bluetooth_settings: Bluetooth,
  draft_email: Mail,
  prepare_whatsapp: MessageSquare,
  send_whatsapp: MessageSquare,
  flashlight: Flashlight,
  battery: Battery,
  share: Share2,
  install_app: Download,
};

const STATUS_STYLE: Record<AgentAction["status"], { label: string; className: string }> = {
  pending: { label: "Needs your confirmation", className: "bg-warning-400/15 text-warning-300" },
  done: { label: "Done", className: "bg-success-400/15 text-success-300" },
  failed: { label: "Not available", className: "bg-error-500/15 text-error-300" },
  cancelled: { label: "Cancelled", className: "bg-panel/10 text-muted" },
};

interface AgentActionCardProps {
  action: AgentAction;
  onConfirm: () => void;
  onCancel: () => void;
}

export function AgentActionCard({ action, onConfirm, onCancel }: AgentActionCardProps) {
  const Icon = ICONS[action.kind];
  const status = STATUS_STYLE[action.status];
  const isPending = action.status === "pending";

  return (
    <div className="glass rounded-2xl p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent/15 text-accent">
          <Icon size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-medium leading-snug">{action.label}</p>
          <span className={`mt-2 inline-block rounded-full px-2.5 py-0.5 text-xs font-medium ${status.className}`}>
            {status.label}
          </span>
          {action.detail && <p className="mt-2 text-sm leading-relaxed text-muted">{action.detail}</p>}
        </div>
      </div>
      {isPending && (
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onCancel} className="btn-ghost !px-3 !py-2">
            <X size={16} /> Cancel
          </button>
          <button type="button" onClick={onConfirm} className="btn-primary !px-3 !py-2">
            <Check size={16} /> {action.requiresConfirmation ? "Confirm" : "Open"}
          </button>
        </div>
      )}
    </div>
  );
}
