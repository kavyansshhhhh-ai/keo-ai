import {
  APP_CATALOG,
  buildAlarm,
  buildBattery,
  buildCamera,
  buildEmailDraft,
  buildFlashlight,
  buildInstallApp,
  buildNavigate,
  buildOpenApp,
  buildSearch,
  buildSettings,
  buildSettingsPage,
  buildWhatsAppDraft,
} from "@/services/agent/actionBuilders";
import type { AgentAction } from "@/types/chat";

export type ParsedCommand =
  | { type: "action"; action: Omit<AgentAction, "status" | "detail"> }
  | { type: "clarify"; message: string }
  | { type: "unsupported"; message: string }
  | { type: "none" };

const WAKE_PREFIX = /^\s*(?:(?:hey|hi|ok|okay|hello|arre)\s+)?keo\b[\s,.!:-]*/i;
const BLOCKED = /\b(delete|remove|erase|hatao|mitao|purchase|buy|kharido|pay|payment|transfer|paisa|paise|upi)\b/i;
const SEARCH_VERB = /\b(search|dhoondo|dhundo|dhoondho|khojo|find|look\s*up)\b/i;
const OPEN_VERB = /\b(open|kholo|kholiye|khol|launch|start|chalu|chalao|chalo)\b/i;
const COMPOSE_VERB = /\b(draft|likho|likh|compose|write|bhejo|bhej|send|prepare|bana|banao|bolo|batao)\b/i;
const EMAIL_WORD = /\b(e-?mail|mail)\b/i;
const WHATSAPP_WORD = /\bwhats\s?app\b/i;
const NAV_WORD = /\b(navigate|navigation|directions|route|rasta|raasta)\b/i;
const REMINDER_WORD = /\b(reminder|remind|yaad\s*dila\w*|yaad\s*dilao)\b/i;
const ALARM_WORD = /\b(alarm|alaram)\b/i;
const CAMERA_WORD = /\bcamera\b/i;
const SETTINGS_WORD = /\bsettings?\b/i;
const YOUTUBE_WORD = /\b(youtube|yt)\b/i;
const FLASHLIGHT_WORD = /\b(flashlight|flash\s*light|torch)\b/i;
const FLASHLIGHT_OFF = /\b(off|band|bandh|bujhao|bujha|disable|turn\s*off)\b/i;
const BATTERY_WORD = /\bbattery\b/i;
const LOCATION_WORD = /\b(location|gps|position|location\s*settings?)\b/i;
const WIFI_WORD = /\bwi-?fi\b/i;
const BLUETOOTH_WORD = /\bbluetooth\b/i;
const INSTALL_VERB = /\b(install|download)\b/i;

const NOISE = new Set([
  "keo", "hey", "hi", "ok", "okay", "please", "pls", "karo", "kar", "do", "kholo", "khol", "kholiye",
  "open", "launch", "start", "search", "dhoondo", "dhundo", "dhoondho", "khojo", "find", "look", "up",
  "for", "on", "in", "par", "pe", "mein", "me", "ka", "ki", "ke", "ko", "ek", "a", "an", "the", "some",
  "something", "video", "videos", "youtube", "yt", "google", "whatsapp", "chrome", "bhai", "mujhe", "mere",
  "liye", "to", "navigate", "navigation", "directions", "rasta", "raasta", "route", "le", "chalo", "jao",
  "bolo", "likho", "likh", "bhejo", "bhej", "send", "draft", "prepare", "message", "msg", "email", "mail",
  "e-mail", "compose", "write", "about", "saying", "that", "bata", "batao", "web", "internet", "set",
  "alarm", "alaram", "reminder", "remind", "yaad", "dilao", "dila", "camera", "settings", "setting",
  "phone", "app", "wala", "wali", "hai", "hain", "is", "are", "my", "this", "and", "with", "bana", "banao",
  "install", "download", "wifi", "wi-fi", "bluetooth", "share", "shared",
]);

function cleanQuery(text: string): string {
  return text
    .split(/\s+/)
    .map((token) => token.replace(/^[^\p{L}\p{N}@+]+|[^\p{L}\p{N}@+]+$/gu, ""))
    .filter((token) => token && !NOISE.has(token.toLowerCase()))
    .join(" ");
}

function parseClockTime(text: string): { hour: number; minute: number } | null {
  const match = text.toLowerCase().match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm|baje|baj|bje)?/);
  if (!match) return null;
  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const suffix = match[3];
  if (suffix === "pm" && hour < 12) hour += 12;
  if (suffix === "am" && hour === 12) hour = 0;
  if (hour > 23 || minute > 59) return null;
  return { hour, minute };
}

function findApp(text: string) {
  return APP_CATALOG.find((app) =>
    app.aliases.some((alias) => new RegExp(`\\b${alias.replace(/\s+/g, "\\s+")}\\b`, "i").test(text)),
  );
}

export function parseCommand(input: string): ParsedCommand {
  const text = input.replace(WAKE_PREFIX, "").trim();
  if (!text) return { type: "none" };
  const wordCount = text.split(/\s+/).length;

  if (BLOCKED.test(text)) {
    return {
      type: "unsupported",
      message:
        "I can't delete, buy, or pay for anything from agent mode. Please do that directly in the app, where you can review it yourself.",
    };
  }

  if (ALARM_WORD.test(text)) {
    const time = parseClockTime(text.replace(ALARM_WORD, " "));
    if (!time) return { type: "clarify", message: "What time should I set the alarm for? For example, \"set alarm for 7:30 am\"." };
    return { type: "action", action: buildAlarm(time.hour, time.minute) };
  }

  if (REMINDER_WORD.test(text)) {
    return {
      type: "unsupported",
      message:
        "Creating reminders needs the native Android module, which this web version can't access yet. I can set an alarm or open an app instead.",
    };
  }

  if (EMAIL_WORD.test(text) && COMPOSE_VERB.test(text)) {
    const address = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/);
    const body = cleanQuery(text.replace(EMAIL_WORD, " ").replace(address?.[0] ?? "", " "));
    if (!body && !address) {
      return { type: "clarify", message: "Who should the email go to, and what should it say?" };
    }
    return { type: "action", action: buildEmailDraft(address?.[0] ?? "", body) };
  }

  if (LOCATION_WORD.test(text)) {
    return { type: "action", action: buildSettingsPage("location") };
  }

  if (WHATSAPP_WORD.test(text)) {
    const msgMatch = text.match(/\b(?:message|msg|send|text|bolo|write|say)\s+([a-zA-Z0-9_\-+]+)\s+(.+)/i) ||
                     text.match(/\bwhats\s?app\s+([a-zA-Z0-9_\-+]+)\s+(.+)/i);
    if (msgMatch) {
      const rawContact = msgMatch[1].replace(/^(and|to|ko|pe|par)$/i, "").trim();
      const messageBody = msgMatch[2].replace(/\b(on\s+whats\s?app|whats\s?app|pe|par|ko)\b/gi, "").trim();
      return { type: "action", action: buildWhatsAppDraft(rawContact, messageBody || "hi") };
    }
    const phoneMatch = text.match(/\+?\d[\d\s-]{7,}\d/);
    const phone = phoneMatch ? phoneMatch[0].replace(/\D/g, "") : "";
    const body = cleanQuery(text.replace(WHATSAPP_WORD, " ").replace(phoneMatch?.[0] ?? "", " "));
    return { type: "action", action: buildWhatsAppDraft(phone || "WhatsApp Contact", body || "hi") };
  }

  if (NAV_WORD.test(text)) {
    const destination = cleanQuery(text);
    if (!destination) return { type: "clarify", message: "Where should I navigate to?" };
    return { type: "action", action: buildNavigate(destination) };
  }

  if (SEARCH_VERB.test(text)) {
    const query = cleanQuery(text);
    if (!query) return { type: "clarify", message: "What should I search for?" };
    return { type: "action", action: buildSearch(YOUTUBE_WORD.test(text) ? "youtube" : "google", query) };
  }

  if (FLASHLIGHT_WORD.test(text)) {
    return { type: "action", action: buildFlashlight(!FLASHLIGHT_OFF.test(text)) };
  }

  if (BATTERY_WORD.test(text)) {
    return { type: "action", action: buildBattery() };
  }

  if (INSTALL_VERB.test(text)) {
    const app = findApp(text) ?? null;
    const query = cleanQuery(text);
    if (!app && !query) return { type: "clarify", message: "Which app should I find on the Play Store?" };
    return { type: "action", action: buildInstallApp(app, query) };
  }

  if (WIFI_WORD.test(text) && (OPEN_VERB.test(text) || wordCount <= 3)) {
    return { type: "action", action: buildSettingsPage("wifi") };
  }

  if (BLUETOOTH_WORD.test(text) && (OPEN_VERB.test(text) || wordCount <= 3)) {
    return { type: "action", action: buildSettingsPage("bluetooth") };
  }

  if (CAMERA_WORD.test(text) && (OPEN_VERB.test(text) || wordCount <= 2)) {
    return { type: "action", action: buildCamera() };
  }

  if (SETTINGS_WORD.test(text) && (OPEN_VERB.test(text) || wordCount <= 2)) {
    return { type: "action", action: buildSettings() };
  }

  const app = findApp(text);
  if (app && (OPEN_VERB.test(text) || wordCount <= 2)) {
    return { type: "action", action: buildOpenApp(app) };
  }

  return { type: "none" };
}
