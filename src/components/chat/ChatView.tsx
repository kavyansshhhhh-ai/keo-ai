import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Composer } from "@/components/chat/Composer";
import { InstalledAppPicker } from "@/components/chat/InstalledAppPicker";
import { MessageList } from "@/components/chat/MessageList";
import { Welcome } from "@/components/chat/Welcome";
import type { ChatThreadState } from "@/hooks/useChatThread";
import { useVoiceInput } from "@/hooks/useVoiceInput";
import { getLocalApiKey } from "@/services/providerKeyService";
import type { ChatMode, Conversation, Language } from "@/types/chat";

interface ChatViewProps {
  thread: ChatThreadState;
  mode: ChatMode;
  language: Language;
  displayName: string;
  recent: Conversation[];
  onChangeMode: (mode: ChatMode) => void;
  onOpenConversation: (conversation: Conversation) => void;
  onOpenSettings?: () => void;
}

export function ChatView(props: ChatViewProps) {
  const {
    thread,
    mode,
    language,
    displayName,
    recent,
    onChangeMode,
    onOpenConversation,
    onOpenSettings,
  } = props;
  const [draft, setDraft] = useState("");
  const [showApps, setShowApps] = useState(false);
  const [hasApiKey, setHasApiKey] = useState(() => Boolean(getLocalApiKey()));

  useEffect(() => {
    setHasApiKey(Boolean(getLocalApiKey()));
  }, [thread.messages.length]);

  const sendText = thread.send;
  const handleVoiceResult = useCallback((text: string) => {
    void sendText(text);
  }, [sendText]);
  const voice = useVoiceInput(language, handleVoiceResult);

  const submitDraft = async () => {
    const sent = await thread.send(draft);
    if (sent) setDraft("");
  };

  const isEmpty = thread.messages.length === 0 && thread.streamingText === null;
  const busy = thread.busy;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto scroll-smooth">
        {thread.loading ? (
          <div className="flex h-full min-h-[40vh] items-center justify-center text-muted">
            <Loader2 className="animate-spin" size={22} aria-label="Loading conversation" />
          </div>
        ) : isEmpty && !thread.error ? (
          <Welcome
            mode={mode}
            displayName={displayName}
            hasApiKey={hasApiKey}
            recent={recent}
            onPrompt={(prompt) => void thread.send(prompt)}
            onOpenConversation={onOpenConversation}
            onOpenSettings={onOpenSettings}
          />
        ) : (
          <MessageList thread={thread} disabled={busy} onOpenSettings={onOpenSettings} />
        )}
      </div>
      <Composer
        value={draft}
        onChange={setDraft}
        onSubmit={() => void submitDraft()}
        onStop={thread.stop}
        streaming={thread.streamingText !== null}
        busy={busy}
        mode={mode}
        onChangeMode={onChangeMode}
        voice={voice}
        onOpenApps={() => setShowApps(true)}
      />
      <InstalledAppPicker
        open={showApps}
        onClose={() => setShowApps(false)}
        onAppLaunched={(app) => {
          void thread.send(`Open ${app.appName}`);
        }}
      />
    </div>
  );
}
