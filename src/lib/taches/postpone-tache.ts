import type { NewTache, Tache } from "@/lib/api/tauri-taches";
import { dateInputAddDays } from "@/lib/taches/tache-date-shortcuts";
import { dateInputToUnix, unixToDateInput } from "@/lib/dates/calendar-date";

export type TachePostponeOption = {
  id: string;
  label: string;
  days: number;
};

export const TACHE_POSTPONE_OPTIONS: TachePostponeOption[] = [
  { id: "tomorrow", label: "Demain", days: 1 },
  { id: "3d", label: "+3 jours", days: 3 },
  { id: "7d", label: "+7 jours", days: 7 },
  { id: "1m", label: "+1 mois", days: 30 },
];

/** Calcule la nouvelle échéance (timestamp Unix) après report. */
export function computePostponedEcheance(
  tache: Tache,
  days: number,
  nowMs: number = Date.now()
): number | null {
  const currentInput =
    tache.date_echeance != null ? unixToDateInput(tache.date_echeance) : null;
  const nextInput = dateInputAddDays(currentInput, days, nowMs);
  return dateInputToUnix(nextInput);
}

/** Payload `updateTache` avec échéance reportée. */
export function buildPostponedTachePayload(tache: Tache, days: number): NewTache {
  return {
    contact_ids: tache.contacts.map((c) => c.contact_id),
    titre: tache.titre,
    description: tache.description ?? null,
    date_echeance: computePostponedEcheance(tache, days),
    priorite: tache.priorite,
    statut: tache.statut,
  };
}
