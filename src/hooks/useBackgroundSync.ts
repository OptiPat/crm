import { useEffect } from "react";
import {
  FOREGROUND_POLL_MS,
  WAKE_DEBOUNCE_MS,
  WAKE_MIN_INTERVAL_MS,
} from "@/lib/background/background-automation-intervals";
import { runNextForegroundGroupIfDue } from "@/lib/background/background-foreground-due-jobs";
import { isCrmWindowVisible } from "@/lib/background/crm-window-visibility";
import { getAppRuntimePrefs } from "@/lib/api/tauri-app-runtime";

/**
 * Automatisations fenêtre visible : un tick unique choisit le prochain groupe dû.
 * Au focus : même orchestration, pas de scan forcé.
 */
export function useBackgroundSync(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    let wakeTimer: number | null = null;
    let lastWakeCycleAtMs = 0;

    const runForegroundTick = async () => {
      try {
        if (!(await isCrmWindowVisible())) return;
        const prefs = await getAppRuntimePrefs();
        await runNextForegroundGroupIfDue(prefs);
      } catch (error) {
        console.warn("Automatisations fenêtre ouverte:", error);
      }
    };

    const onWake = () => {
      void (async () => {
        if (!(await isCrmWindowVisible())) return;
        if (wakeTimer != null) globalThis.clearTimeout(wakeTimer);
        wakeTimer = globalThis.setTimeout(() => {
          wakeTimer = null;
          void (async () => {
            const now = Date.now();
            if (now - lastWakeCycleAtMs < WAKE_MIN_INTERVAL_MS) return;
            lastWakeCycleAtMs = now;
            await runForegroundTick();
          })();
        }, WAKE_DEBOUNCE_MS) as unknown as number;
      })();
    };

    const foregroundInterval = globalThis.setInterval(() => {
      void runForegroundTick();
    }, FOREGROUND_POLL_MS);

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    lastWakeCycleAtMs = Date.now();
    void runForegroundTick();

    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      globalThis.clearInterval(foregroundInterval);
      if (wakeTimer != null) globalThis.clearTimeout(wakeTimer);
    };
  }, [enabled]);
}

export {
  RELATION_COOLDOWN_MS,
  RELATION_INTERVAL_MS,
  STELLIUM_COOLDOWN_MS,
  STELLIUM_INTERVAL_MS,
  BIRTHDAY_COOLDOWN_MS,
  BIRTHDAY_INTERVAL_MS,
  WAKE_MIN_INTERVAL_MS,
  FOREGROUND_POLL_MS,
} from "@/lib/background/background-automation-intervals";
