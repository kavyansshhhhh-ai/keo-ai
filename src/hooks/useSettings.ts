import { useCallback, useEffect, useRef, useState } from "react";
import { DEFAULT_SETTINGS } from "@/lib/defaults";
import { errorMessage } from "@/lib/errors";
import { fetchSettings, saveSettings } from "@/services/settingsRepository";
import type { AppSettings } from "@/types/chat";

export function useSettings() {
  const [settings, setSettings] = useState<AppSettings>(DEFAULT_SETTINGS);
  const [error, setError] = useState<string | null>(null);
  const settingsRef = useRef<AppSettings>(DEFAULT_SETTINGS);

  useEffect(() => {
    let cancelled = false;
    fetchSettings()
      .then((data) => {
        if (cancelled) return;
        settingsRef.current = data;
        setSettings(data);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(errorMessage(err, "Could not load your settings."));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle("light", settings.theme === "light");
  }, [settings.theme]);

  const update = useCallback(async (patch: Partial<AppSettings>): Promise<boolean> => {
    const previous = settingsRef.current;
    const next = { ...previous, ...patch };
    settingsRef.current = next;
    setSettings(next);
    setError(null);
    try {
      await saveSettings(patch);
      return true;
    } catch (err) {
      settingsRef.current = previous;
      setSettings(previous);
      setError(errorMessage(err, "Could not save your settings."));
      return false;
    }
  }, []);

  return { settings, error, update };
}
