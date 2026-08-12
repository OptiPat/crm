import {
  filterPatrimoineTimelineForClient,
  type PatrimoineTimelineEvent,
} from "@/lib/patrimoine/timeline";

/**
 * Événement de timeline tel que le moteur Rust le produit — pour le portail
 * comme pour l'aperçu du conseiller.
 */
export interface EspaceClientTimelineEventDto {
  id: string;
  kind: string;
  date: number;
  label: string;
  detail?: string | null;
  typeProduit?: string | null;
  origine?: string | null;
  rdvUrl?: string | null;
}

/**
 * Seule traduction des échéances vers l'écran client, partagée par le portail
 * et l'aperçu du CRM.
 *
 * Les règles d'affichage (quelles échéances, dans quel ordre, avec quel
 * bouton) appartiennent au moteur Rust : les deux écrans lisent la même liste
 * plutôt que de la reconstruire chacun de son côté, faute de quoi elles
 * divergent sans que rien ne le signale.
 */
export function toClientTimeline(
  events: EspaceClientTimelineEventDto[]
): PatrimoineTimelineEvent[] {
  return filterPatrimoineTimelineForClient(
    events.map((event) => ({
      id: event.id,
      kind: event.kind as PatrimoineTimelineEvent["kind"],
      date: event.date,
      label: event.label,
      detail: event.detail ?? undefined,
      rdvUrl: event.rdvUrl ?? undefined,
      type_produit: event.typeProduit ?? undefined,
      origine: event.origine ?? undefined,
    }))
  );
}
