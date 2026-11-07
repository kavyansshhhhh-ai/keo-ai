import { useMemo, useState, type KeyboardEvent } from "react";
import { Check, MessageSquare, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import { ConfirmDialog } from "@/components/common/Modal";
import { errorMessage } from "@/lib/errors";
import { formatRelativeTime } from "@/lib/format";
import type { Conversation } from "@/types/chat";

interface HistoryPanelProps {
  open: boolean;
  onClose: () => void;
  conversations: Conversation[];
  loading: boolean;
  error: string | null;
  activeId: string | null;
  onNew: () => void;
  onSelect: (conversation: Conversation) => void;
  onRename: (id: string, title: string) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

export function HistoryPanel(props: HistoryPanelProps) {
  const { open, onClose, conversations, loading, error, activeId, onNew, onSelect, onRename, onDelete } = props;
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [renameError, setRenameError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Conversation | null>(null);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return needle ? conversations.filter((c) => c.title.toLowerCase().includes(needle)) : conversations;
  }, [conversations, query]);

  const startRename = (conversation: Conversation) => {
    setEditingId(conversation.id);
    setEditTitle(conversation.title);
    setRenameError(null);
  };

  const saveRename = async (id: string) => {
    const title = editTitle.trim();
    if (!title) {
      setEditingId(null);
      return;
    }
    try {
      await onRename(id, title);
      setEditingId(null);
    } catch (err) {
      setRenameError(errorMessage(err, "Could not rename this conversation."));
    }
  };

  const handleRenameKey = (event: KeyboardEvent<HTMLInputElement>, id: string) => {
    if (event.key === "Enter") void saveRename(id);
    if (event.key === "Escape") setEditingId(null);
  };

  return (
    <>
      <div
        aria-hidden
        onClick={onClose}
        className={`fixed inset-0 z-30 bg-black/50 backdrop-blur-sm transition-opacity duration-300 lg:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <aside
        aria-label="Chat history"
        className={`glass-strong fixed inset-y-0 left-0 z-40 flex w-80 max-w-[85vw] flex-col border-r transition-transform duration-300 ease-out lg:static lg:z-auto lg:w-72 lg:max-w-none lg:translate-x-0 lg:bg-transparent lg:backdrop-blur-none ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-5 pb-3 pt-5">
          <h2 className="text-base font-semibold">History</h2>
          <button type="button" onClick={onClose} aria-label="Close history" className="icon-btn lg:hidden">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-3 px-4">
          <button type="button" onClick={onNew} className="btn-primary w-full">
            <Plus size={16} /> New chat
          </button>
          <label className="relative block">
            <Search size={15} className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search chats"
              aria-label="Search chats"
              className="field !pl-9"
            />
          </label>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-2 pb-6">
          {loading && conversations.length === 0 && <p className="px-3 py-4 text-sm text-muted">Loading...</p>}
          {error && <p role="alert" className="px-3 py-4 text-sm text-error-300">{error}</p>}
          {!loading && !error && conversations.length === 0 && (
            <p className="px-3 py-4 text-sm leading-relaxed text-muted">No conversations yet. Start a new chat to begin.</p>
          )}
          {!loading && conversations.length > 0 && visible.length === 0 && (
            <p className="px-3 py-4 text-sm text-muted">No chats match your search.</p>
          )}
          <ul className="flex flex-col gap-1">
            {visible.map((conversation) => {
              const active = conversation.id === activeId;
              const editing = editingId === conversation.id;
              return (
                <li key={conversation.id} className="group relative">
                  {editing ? (
                    <div className="px-2 py-1.5">
                      <input
                        autoFocus
                        value={editTitle}
                        onChange={(event) => setEditTitle(event.target.value)}
                        onKeyDown={(event) => handleRenameKey(event, conversation.id)}
                        maxLength={120}
                        aria-label="Conversation title"
                        className="field !py-2"
                      />
                      {renameError && <p className="mt-1 text-xs text-error-300">{renameError}</p>}
                      <div className="mt-2 flex justify-end gap-1">
                        <button type="button" onClick={() => setEditingId(null)} aria-label="Cancel rename" className="icon-btn !h-8 !w-8">
                          <X size={15} />
                        </button>
                        <button type="button" onClick={() => void saveRename(conversation.id)} aria-label="Save title" className="icon-btn !h-8 !w-8 text-accent">
                          <Check size={15} />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => onSelect(conversation)}
                        aria-current={active ? "true" : undefined}
                        className={`flex w-full items-start gap-3 rounded-xl px-3 py-2.5 pr-20 text-left transition ${
                          active ? "bg-accent/15 text-fg" : "text-fg/80 hover:bg-panel/5"
                        }`}
                      >
                        <MessageSquare size={15} className={`mt-0.5 shrink-0 ${active ? "text-accent" : "text-muted"}`} />
                        <span className="min-w-0">
                          <span className="block truncate text-sm">{conversation.title}</span>
                          <span className="mt-0.5 block text-xs text-muted">
                            {conversation.mode === "agent" ? "Agent" : "Chat"} · {formatRelativeTime(conversation.updated_at)}
                          </span>
                        </span>
                      </button>
                      <div className="absolute right-2 top-2 flex opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                        <button type="button" onClick={() => startRename(conversation)} aria-label="Rename conversation" className="icon-btn !h-8 !w-8">
                          <Pencil size={14} />
                        </button>
                        <button type="button" onClick={() => setDeleteTarget(conversation)} aria-label="Delete conversation" className="icon-btn !h-8 !w-8 hover:text-error-400">
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>
      </aside>

      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete this conversation?"
        message="The conversation and all of its messages will be permanently removed. This cannot be undone."
        confirmLabel="Delete"
        onClose={() => setDeleteTarget(null)}
        onConfirm={async () => {
          if (deleteTarget) await onDelete(deleteTarget.id);
        }}
      />
    </>
  );
}
