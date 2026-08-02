import {
  checkAndCreateArbitrageAlerts,
  checkAndCreateDemembrementAlerts,
  genererAlertesAutomatiques,
} from "@/lib/api/tauri-alertes";
import { notifyAlertesChanged } from "@/lib/alertes/alert-events";

/** Intervalle minimal entre deux cycles (focus / réveil), hors premier lancement. */
export const ALERTES_GENERATION_COOLDOWN_MS = 5 * 60 * 1000;

let cycleInFlight: Promise<void> | null = null;
let lastCycleCompletedAt = 0;

/**
 * Génère les alertes automatiques (démembrement, arbitrage, segments Suivi).
 * Un seul cycle à la fois ; notification UI unique à la fin.
 */
export async function runAlertesGenerationCycle(
  options: { force?: boolean } = {}
): Promise<void> {
  if (cycleInFlight) return cycleInFlight;

  const elapsed = Date.now() - lastCycleCompletedAt;
  if (!options.force && lastCycleCompletedAt > 0 && elapsed < ALERTES_GENERATION_COOLDOWN_MS) {
    return;
  }

  cycleInFlight = (async () => {
    try {
      try {
        await checkAndCreateDemembrementAlerts();
      } catch (error) {
        console.error("Erreur alertes démembrement:", error);
      }

      try {
        await checkAndCreateArbitrageAlerts();
      } catch (error) {
        console.error("Erreur alertes arbitrage:", error);
      }

      try {
        await genererAlertesAutomatiques();
      } catch (error) {
        console.error("Erreur génération alertes:", error);
      }

      notifyAlertesChanged();
      lastCycleCompletedAt = Date.now();
    } finally {
      cycleInFlight = null;
    }
  })();

  return cycleInFlight;
}

/** Réinitialise l'état (tests). */
export function resetAlertesGenerationCycleState(): void {
  cycleInFlight = null;
  lastCycleCompletedAt = 0;
}
