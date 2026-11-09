import { KeoNative, isNativeApp, type InstalledAppInfo } from "@/services/native/keoNative";

export type { InstalledAppInfo };

const CACHE_KEY = "keo_installed_apps_cache";

export const COMMON_FALLBACK_APPS: InstalledAppInfo[] = [
  { appName: "YouTube", packageName: "com.google.android.youtube" },
  { appName: "WhatsApp", packageName: "com.whatsapp" },
  { appName: "Google Chrome", packageName: "com.android.chrome" },
  { appName: "Gmail", packageName: "com.google.android.gm" },
  { appName: "Google Maps", packageName: "com.google.android.apps.maps" },
  { appName: "Instagram", packageName: "com.instagram.android" },
  { appName: "Spotify", packageName: "com.spotify.music" },
  { appName: "Google Play Store", packageName: "com.android.vending" },
  { appName: "Camera", packageName: "com.google.android.GoogleCamera" },
  { appName: "Photos", packageName: "com.google.android.apps.photos" },
  { appName: "Phone", packageName: "com.google.android.dialer" },
  { appName: "Messages", packageName: "com.google.android.apps.messaging" },
  { appName: "Settings", packageName: "com.android.settings" },
  { appName: "Calculator", packageName: "com.google.android.calculator" },
  { appName: "Clock", packageName: "com.google.android.deskclock" },
  { appName: "Files", packageName: "com.google.android.documentsui" },
  { appName: "Facebook", packageName: "com.facebook.katana" },
  { appName: "Telegram", packageName: "org.telegram.messenger" },
  { appName: "X / Twitter", packageName: "com.twitter.android" },
  { appName: "Snapchat", packageName: "com.snapchat.android" },
  { appName: "Netflix", packageName: "com.netflix.ninja" },
  { appName: "Amazon Prime Video", packageName: "com.amazon.avod.thirdpartyclient" },
  { appName: "Disney+ Hotstar", packageName: "in.startv.hotstar" },
  { appName: "Paytm", packageName: "net.one97.paytm" },
  { appName: "Google Pay", packageName: "com.google.android.apps.nbu.paisa.user" },
  { appName: "PhonePe", packageName: "com.phonepe.app" },
];

const ALIAS_MAP: Record<string, string[]> = {
  youtube: ["youtube", "yt", "yutub", "video"],
  whatsapp: ["whatsapp", "whats app", "watsapp", "wa"],
  chrome: ["chrome", "google chrome", "browser", "internet"],
  gmail: ["gmail", "email", "mail"],
  maps: ["maps", "google maps", "map", "naksha", "directions"],
  instagram: ["instagram", "insta", "ig"],
  spotify: ["spotify", "music", "gaana", "gana", "songs"],
  play: ["play store", "playstore", "google play", "store"],
  camera: ["camera", "kamera", "photo"],
  photos: ["photos", "gallery", "photo gallery", "images"],
  phone: ["phone", "dialer", "call", "calling"],
  messages: ["messages", "message", "sms", "chat"],
  settings: ["settings", "setting", "phone settings"],
  calculator: ["calculator", "calc", "hisab"],
  clock: ["clock", "alarm", "alaram", "ghadi"],
  files: ["files", "file manager", "my files"],
  telegram: ["telegram", "tele"],
  facebook: ["facebook", "fb"],
  twitter: ["twitter", "x", "x app"],
  snapchat: ["snapchat", "snap"],
};

let cachedApps: InstalledAppInfo[] | null = null;

export async function getInstalledAppList(forceRefresh = false): Promise<InstalledAppInfo[]> {
  if (cachedApps && !forceRefresh) return cachedApps;

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      cachedApps = JSON.parse(raw);
    }
  } catch {
    // Ignore parse error
  }

  if (isNativeApp()) {
    try {
      const res = await KeoNative.getInstalledApps();
      if (res.apps && res.apps.length > 0) {
        cachedApps = res.apps;
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(res.apps));
        } catch {
          // ignore
        }
        return cachedApps;
      }
    } catch (err) {
      console.warn("[KEO] Native getInstalledApps error, using catalog:", err);
    }
  }

  if (!cachedApps || cachedApps.length === 0) {
    cachedApps = COMMON_FALLBACK_APPS;
  }
  return cachedApps;
}

function cleanAppName(text: string): string {
  return text
    .toLowerCase()
    .replace(/\b(open|kholo|khol|kholiye|launch|start|chalu|chalao|chalo|app|application|wala|wali|please|pls)\b/gi, "")
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .trim();
}

export async function matchInstalledApps(queryText: string): Promise<{
  exact: InstalledAppInfo | null;
  candidates: InstalledAppInfo[];
  cleanedTarget: string;
}> {
  const target = cleanAppName(queryText);
  if (!target) return { exact: null, candidates: [], cleanedTarget: "" };

  const apps = await getInstalledAppList();

  // 1. Check alias map first
  for (const [key, aliases] of Object.entries(ALIAS_MAP)) {
    if (aliases.some((alias) => target === alias || target.includes(alias))) {
      const match = apps.find(
        (a) =>
          a.appName.toLowerCase().includes(key) ||
          a.packageName.toLowerCase().includes(key)
      );
      if (match) return { exact: match, candidates: [match], cleanedTarget: target };
    }
  }

  // 2. Exact name match (case-insensitive)
  const exact = apps.find(
    (a) =>
      a.appName.toLowerCase() === target ||
      a.packageName.toLowerCase().endsWith(`.${target}`)
  );
  if (exact) return { exact, candidates: [exact], cleanedTarget: target };

  // 3. Substring candidates
  const candidates = apps.filter(
    (a) =>
      a.appName.toLowerCase().includes(target) ||
      a.packageName.toLowerCase().includes(target)
  );

  if (candidates.length === 1) {
    return { exact: candidates[0], candidates, cleanedTarget: target };
  }

  return { exact: null, candidates, cleanedTarget: target };
}
