import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";
import { getTypeAlerteLabel } from "@/lib/alertes/alerte-labels";
import { dateInputToday } from "@/lib/taches/tache-date-shortcuts";
import { dateInputToUnix } from "@/lib/dates/calendar-date";

export type TacheDraftFromAlerte = {
  titre: string;
  contactIds: number[];
  dateEcheance: string;
};

/** Préremplit une tâche à partir d'une alerte Suivi. */
export function buildTacheDraftFromAlerte(alerte: AlerteWithContact): TacheDraftFromAlerte {
  const name = `${alerte.contact_prenom} ${alerte.contact_nom}`.trim();
  const typeLabel = getTypeAlerteLabel(alerte.type_alerte);
  return {
    titre: `${typeLabel} — ${name}`,
    contactIds: [alerte.contact_id],
    dateEcheance: dateInputToday(),
  };
}

export function buildTachePayloadFromAlerte(alerte: AlerteWithContact) {
  const draft = buildTacheDraftFromAlerte(alerte);
  return {
    contact_ids: draft.contactIds,
    titre: draft.titre,
    date_echeance: dateInputToUnix(draft.dateEcheance),
    priorite: "NORMALE" as const,
    statut: "A_FAIRE" as const,
  };
}
