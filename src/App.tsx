import { useEffect, useState } from "react";
import { ChatView } from "@/components/chat/ChatView";
import { AppHeader } from "@/components/layout/AppHeader";
import { HistoryPanel } from "@/components/history/HistoryPanel";
import { ProfileDialog } from "@/components/profile/ProfileDialog";
import { SettingsScreen } from "@/components/settings/SettingsScreen";
import { PermissionWizard } from "@/components/onboarding/PermissionWizard";
import { useChatThread } from "@/hooks/useChatThread";
import { useConversations } from "@/hooks/useConversations";
import { useSettings } from "@/hooks/useSettings";
import { errorMessage } from "@/lib/errors";
import { updateConversation } from "@/services/chatRepository";
import { isNativeApp } from "@/services/native/keoNative";
import { App as CapApp } from "@capacitor/app";
import type { ChatMode, Conversation } from "@/types/chat";

type Screen = "chat" | "settings";

export default function App() {
  const { settings, error: settingsError, update: updateSettings } = useSettings();
  const history = useConversations();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [mode, setMode] = useState<ChatMode>("chat");
  const [screen, setScreen] = useState<Screen>("chat");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [showWizard, setShowWizard] = useState(() => {
    return isNativeApp() && !localStorage.getItem("keo_onboarding_completed");
  });

  // Native Android Back Button Navigation
  useEffect(() => {
    if (!isNativeApp()) return;

    let removeListener: (() => void) | undefined;
    CapApp.addListener("backButton", ({ canGoBack }) => {
      if (showWizard) return; // PermissionWizard manages its own back button step flow
      if (historyOpen) {
        setHistoryOpen(false);
        return;
      }
      if (profileOpen) {
        setProfileOpen(false);
        return;
      }
      if (screen === "settings") {
        setScreen("chat");
        return;
      }
      if (canGoBack) {
        window.history.back();
      } else {
        void CapApp.exitApp();
      }
    })
      .then((handle) => {
        removeListener = () => void handle.remove();
      })
      .catch((err) => console.warn("[KEO] backButton setup error:", err));

    return () => {
      if (removeListener) removeListener();
    };
  }, [showWizard, historyOpen, profileOpen, screen]);

  useEffect(() => {
    const goOnline = () => setOnline(true);
    const goOffline = () => setOnline(false);
    window.addEventListener("online", goOnline);
    window.addEventListener("offline", goOffline);
    return () => {
      window.removeEventListener("online", goOnline);
      window.removeEventListener("offline", goOffline);
    };
  }, []);

  const thread = useChatThread({
    conversationId,
    mode,
    language: settings.language,
    contextMessages: settings.context_messages,
    speakReplies: settings.speak_replies,
    onActivate: (conversation) => {
      history.addLocal(conversation);
      setConversationId(conversation.id);
    },
    onChanged: () => {
      void history.refresh();
    },
  });

  const openConversation = (conversation: Conversation) => {
    setMode(conversation.mode);
    setConversationId(conversation.id);
    setScreen("chat");
    setHistoryOpen(false);
  };

  const startNewChat = () => {
    setConversationId(null);
    setScreen("chat");
    setHistoryOpen(false);
  };

  const changeMode = (next: ChatMode) => {
    setMode(next);
    if (!conversationId) return;
    updateConversation(conversationId, { mode: next })
      .then(() => history.refresh())
      .catch((err: unknown) => setNotice(errorMessage(err, "Could not switch the mode for this chat.")));
  };

  const deleteConversation = async (id: string) => {
    await history.remove(id);
    if (id === conversationId) setConversationId(null);
  };

  const clearAllHistory = async () => {
    await history.removeAll();
    setConversationId(null);
  };

  const saveProfile = async (name: string) => {
    const saved = await updateSettings({ display_name: name });
    if (!saved) throw new Error("Could not save your profile.");
  };

  const finishWizard = () => {
    localStorage.setItem("keo_onboarding_completed", "true");
    setShowWizard(false);
  };

  const bannerMessage = settingsError ?? notice;

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      {showWizard && <PermissionWizard onComplete={finishWizard} />}
      <div
        aria-hidden
        className="pointer-events-none fixed inset-x-0 top-0 h-80 bg-[radial-gradient(ellipse_at_top,rgb(var(--accent)/0.10),transparent_70%)]"
      />
      <AppHeader
        online={online}
        onHome={startNewChat}
        onOpenHistory={() => setHistoryOpen(true)}
        onOpenProfile={() => setProfileOpen(true)}
        onOpenSettings={() => setScreen("settings")}
      />

      <div className="relative flex min-h-0 flex-1">
        <HistoryPanel
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          conversations={history.conversations}
          loading={history.loading}
          error={history.error}
          activeId={conversationId}
          onNew={startNewChat}
          onSelect={openConversation}
          onRename={history.rename}
          onDelete={deleteConversation}
        />

        <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
          {bannerMessage && (
            <div role="alert" className="glass mx-4 mt-3 flex items-center justify-between gap-3 rounded-xl px-4 py-2.5 text-sm text-error-300 sm:mx-6">
              <span>{bannerMessage}</span>
              <button
                type="button"
                className="text-xs text-muted underline underline-offset-4 hover:text-fg"
                onClick={() => setNotice(null)}
              >
                Dismiss
              </button>
            </div>
          )}

          {screen === "settings" ? (
            <div className="min-h-0 flex-1 overflow-y-auto">
              <SettingsScreen
                settings={settings}
                conversationCount={history.conversations.length}
                onUpdate={updateSettings}
                onClearAll={clearAllHistory}
                onBack={() => setScreen("chat")}
                onOpenWizard={() => setShowWizard(true)}
              />
            </div>
          ) : (
            <ChatView
              thread={thread}
              mode={mode}
              language={settings.language}
              displayName={settings.display_name}
              recent={history.conversations.slice(0, 4)}
              onChangeMode={changeMode}
              onOpenConversation={openConversation}
              onOpenSettings={() => setScreen("settings")}
            />
          )}
        </main>
      </div>

      <ProfileDialog
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        displayName={settings.display_name}
        conversationCount={history.conversations.length}
        onSave={saveProfile}
      />
    </div>
  );
}
