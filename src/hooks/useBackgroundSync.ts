import { useEffect } from "react";
import {
  NOTES_INTERVAL_MS,
  RELATION_INTERVAL_MS,
  STELLIUM_INTERVAL_MS,
  BIRTHDAY_INTERVAL_MS,
  WAKE_DEBOUNCE_MS,
} from "@/lib/background/background-automation-intervals";
import {
  automationJobCooldownRemainingMs,
  shouldRunAutomationJobWithCooldown,
} from "@/lib/background/background-automation-state";
import { runBackgroundAutomationCycle } from "@/lib/background/background-automation-runner";

/**
 * Automatisations fenêtre visible : sync Gmail/Agenda, Stellium, notes, rappels RDV, anniversaires.
 */
export function useBackgroundSync(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    let wakeTimer: number | null = null;

    const onWake = () => {
      if (document.hidden) return;
      if (wakeTimer != null) globalThis.clearTimeout(wakeTimer);
      wakeTimer = globalThis.setTimeout(() => {
        wakeTimer = null;
        void runBackgroundAutomationCycle({
          surface: "foreground",
          force: true,
        });
      }, WAKE_DEBOUNCE_MS) as unknown as number;
    };

    const relationInterval = globalThis.setInterval(() => {
      if (document.hidden) return;
      if (automationJobCooldownRemainingMs("relation") > 0) return;
      void runBackgroundAutomationCycle({
        surface: "foreground",
        jobs: { relation: true, pipe_rdv: true, stellium: false, notes: false, birthdays: false },
      });
    }, RELATION_INTERVAL_MS);

    const stelliumInterval = globalThis.setInterval(() => {
      if (document.hidden) return;
      if (!shouldRunAutomationJobWithCooldown("stellium")) return;
      void runBackgroundAutomationCycle({
        surface: "foreground",
        jobs: { relation: false, pipe_rdv: false, stellium: true, notes: false, birthdays: false },
      });
    }, STELLIUM_INTERVAL_MS);

    const notesInterval = globalThis.setInterval(() => {
      if (document.hidden) return;
      if (!shouldRunAutomationJobWithCooldown("notes")) return;
      void runBackgroundAutomationCycle({
        surface: "foreground",
        jobs: { relation: false, pipe_rdv: false, stellium: false, notes: true, birthdays: false },
      });
    }, NOTES_INTERVAL_MS);

    const birthdaysInterval = globalThis.setInterval(() => {
      if (document.hidden) return;
      if (!shouldRunAutomationJobWithCooldown("birthdays")) return;
      void runBackgroundAutomationCycle({
        surface: "foreground",
        jobs: {
          relation: false,
          pipe_rdv: false,
          stellium: false,
          notes: false,
          birthdays: true,
        },
      });
    }, BIRTHDAY_INTERVAL_MS);

    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    void runBackgroundAutomationCycle({ surface: "foreground", force: true });

    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      globalThis.clearInterval(relationInterval);
      globalThis.clearInterval(stelliumInterval);
      globalThis.clearInterval(notesInterval);
      globalThis.clearInterval(birthdaysInterval);
      if (wakeTimer != null) globalThis.clearTimeout(wakeTimer);
    };
  }, [enabled]);
}

// Réexport pour les tests et compatibilité
export {
  NOTES_COOLDOWN_MS,
  NOTES_INTERVAL_MS,
  RELATION_COOLDOWN_MS,
  RELATION_INTERVAL_MS,
  STELLIUM_COOLDOWN_MS,
  STELLIUM_INTERVAL_MS,
  BIRTHDAY_COOLDOWN_MS,
  BIRTHDAY_INTERVAL_MS,
} from "@/lib/background/background-automation-intervals";
