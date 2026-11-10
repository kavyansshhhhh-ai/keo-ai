import type { AgentAction } from "@/types/chat";

export interface AppTarget {
  key: string;
  label: string;
  aliases: string[];
  web: string;
  androidPackage: string;
}

export const APP_CATALOG: AppTarget[] = [
  { key: "youtube", label: "YouTube", aliases: ["youtube", "yt", "yutub"], web: "https://www.youtube.com", androidPackage: "com.google.android.youtube" },
  { key: "whatsapp", label: "WhatsApp", aliases: ["whatsapp", "whats app", "watsapp"], web: "https://web.whatsapp.com", androidPackage: "com.whatsapp" },
  { key: "chrome", label: "Chrome", aliases: ["chrome", "google chrome", "browser"], web: "https://www.google.com", androidPackage: "com.android.chrome" },
  { key: "gmail", label: "Gmail", aliases: ["gmail", "email", "mail"], web: "https://mail.google.com", androidPackage: "com.google.android.gm" },
  { key: "maps", label: "Google Maps", aliases: ["maps", "google maps", "map", "naksha"], web: "https://www.google.com/maps", androidPackage: "com.google.android.apps.maps" },
  { key: "instagram", label: "Instagram", aliases: ["instagram", "insta"], web: "https://www.instagram.com", androidPackage: "com.instagram.android" },
  { key: "spotify", label: "Spotify", aliases: ["spotify", "music", "gaana"], web: "https://open.spotify.com", androidPackage: "com.spotify.music" },
  { key: "play", label: "Play Store", aliases: ["play store", "playstore", "google play"], web: "https://play.google.com/store", androidPackage: "com.android.vending" },
  { key: "phone", label: "Phone", aliases: ["phone", "dialer", "call", "phone dialer"], web: "https://www.google.com", androidPackage: "com.google.android.dialer" },
  { key: "messages", label: "Messages", aliases: ["messages", "message", "sms"], web: "https://messages.google.com", androidPackage: "com.google.android.apps.messaging" },
  { key: "camera", label: "Camera", aliases: ["camera", "kamera", "photo"], web: "https://www.google.com", androidPackage: "com.google.android.GoogleCamera" },
  { key: "gallery", label: "Photos", aliases: ["photos", "gallery", "photo gallery"], web: "https://photos.google.com", androidPackage: "com.google.android.apps.photos" },
  { key: "telegram", label: "Telegram", aliases: ["telegram"], web: "https://web.telegram.org", androidPackage: "org.telegram.messenger" },
  { key: "facebook", label: "Facebook", aliases: ["facebook", "fb"], web: "https://www.facebook.com", androidPackage: "com.facebook.katana" },
  { key: "twitter", label: "X / Twitter", aliases: ["twitter", "x", "x app"], web: "https://x.com", androidPackage: "com.twitter.android" },
  { key: "snapchat", label: "Snapchat", aliases: ["snapchat", "snap"], web: "https://www.snapchat.com", androidPackage: "com.snapchat.android" },
  { key: "calculator", label: "Calculator", aliases: ["calculator", "calc", "hisab"], web: "https://www.google.com", androidPackage: "com.google.android.calculator" },
  { key: "clock", label: "Clock", aliases: ["clock", "alarm clock"], web: "https://www.google.com", androidPackage: "com.google.android.deskclock" },
];

type ActionDraft = Omit<AgentAction, "status" | "detail">;

function launchIntent(app: AppTarget): string {
  return [
    "intent:#Intent",
    "action=android.intent.action.MAIN",
    "category=android.intent.category.LAUNCHER",
    `package=${app.androidPackage}`,
    `S.browser_fallback_url=${encodeURIComponent(app.web)}`,
    "end",
  ].join(";");
}

export function buildOpenApp(app: AppTarget): ActionDraft {
  return {
    kind: "open_app",
    label: `Open ${app.label}`,
    url: app.web,
    androidIntent: launchIntent(app),
    androidPackage: app.androidPackage,
    requiresConfirmation: false,
  };
}

export function buildSearch(service: "google" | "youtube", query: string): ActionDraft {
  const encoded = encodeURIComponent(query);
  const isYouTube = service === "youtube";
  return {
    kind: "search",
    label: `Search ${isYouTube ? "YouTube" : "Google"} for "${query}"`,
    url: isYouTube
      ? `https://www.youtube.com/results?search_query=${encoded}`
      : `https://www.google.com/search?q=${encoded}`,
    requiresConfirmation: false,
  };
}

export function buildNavigate(destination: string): ActionDraft {
  return {
    kind: "navigate",
    label: `Navigate to ${destination}`,
    url: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`,
    requiresConfirmation: false,
  };
}

export function buildAlarm(hour: number, minute: number): ActionDraft {
  const hh = String(hour % 12 || 12);
  const mm = String(minute).padStart(2, "0");
  const period = hour < 12 ? "AM" : "PM";
  return {
    kind: "set_alarm",
    label: `Set alarm for ${hh}:${mm} ${period}`,
    androidIntent: [
      "intent:#Intent",
      "action=android.intent.action.SET_ALARM",
      `i.android.intent.extra.alarm.HOUR=${hour}`,
      `i.android.intent.extra.alarm.MINUTES=${minute}`,
      "end",
    ].join(";"),
    requiresConfirmation: false,
  };
}

export function buildCamera(): ActionDraft {
  return {
    kind: "open_camera",
    label: "Open camera",
    androidIntent: "intent:#Intent;action=android.media.action.STILL_IMAGE_CAMERA;end",
    requiresConfirmation: false,
  };
}

export function buildSettings(): ActionDraft {
  return {
    kind: "open_settings",
    label: "Open phone settings",
    androidIntent: "intent:#Intent;action=android.settings.SETTINGS;end",
    requiresConfirmation: false,
  };
}

export function buildSettingsPage(page: "wifi" | "bluetooth" | "location"): ActionDraft {
  if (page === "wifi") {
    return {
      kind: "open_wifi_settings",
      label: "Open Wi-Fi settings",
      androidIntent: "intent:#Intent;action=android.settings.WIFI_SETTINGS;end",
      requiresConfirmation: false,
    };
  }
  if (page === "location") {
    return {
      kind: "open_wifi_settings",
      label: "Open Location Settings (Android requires user tap to toggle GPS)",
      androidIntent: "intent:#Intent;action=android.settings.LOCATION_SOURCE_SETTINGS;end",
      requiresConfirmation: false,
    };
  }
  return {
    kind: "open_bluetooth_settings",
    label: "Open Bluetooth settings",
    androidIntent: "intent:#Intent;action=android.settings.BLUETOOTH_SETTINGS;end",
    requiresConfirmation: false,
  };
}

export function buildFlashlight(on: boolean): ActionDraft {
  return {
    kind: "flashlight",
    label: on ? "Turn on flashlight (needs camera access, used only for torch)" : "Turn off flashlight",
    torch: on,
    requiresConfirmation: false,
  };
}

export function buildBattery(): ActionDraft {
  return { kind: "battery", label: "Check battery status", requiresConfirmation: false };
}

export function buildShare(text: string): ActionDraft {
  const preview = text.length > 60 ? `${text.slice(0, 57)}...` : text;
  return { kind: "share", label: `Share "${preview}"`, text, requiresConfirmation: true };
}

export function buildInstallApp(app: AppTarget | null, query: string): ActionDraft {
  const url = app
    ? `https://play.google.com/store/apps/details?id=${app.androidPackage}`
    : `https://play.google.com/store/search?q=${encodeURIComponent(query)}&c=apps`;
  return {
    kind: "install_app",
    label: app ? `Open ${app.label} on Play Store` : `Find "${query}" on Play Store`,
    url,
    requiresConfirmation: false,
  };
}

export function buildEmailDraft(to: string, body: string): ActionDraft {
  const subject = body.length > 60 ? `${body.slice(0, 57)}...` : body;
  const recipient = to ? `Email to ${to}` : "Draft email";
  return {
    kind: "draft_email",
    label: recipient,
    url: `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`,
    requiresConfirmation: true,
  };
}

export function buildWhatsAppDraft(target: string, text: string): ActionDraft {
  const cleanTarget = target.trim();
  const isPhone = /^\+?\d+$/.test(cleanTarget);
  const phone = isPhone ? cleanTarget : "";
  const label = cleanTarget ? `Prepare WhatsApp message to "${cleanTarget}": "${text}"` : "Prepare WhatsApp message";
  const url = phone
    ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
    : `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;

  return {
    kind: "prepare_whatsapp",
    label,
    target: cleanTarget,
    phone,
    text,
    url,
    requiresConfirmation: true,
  };
}
