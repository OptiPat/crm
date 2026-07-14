import type { PlacementOperationType } from "@/lib/api/tauri-box-placement";
import type { PipeTimelineUserType } from "@/lib/pipe/pipe-timeline-types";

export const PLACEMENT_PARTENAIRE_TIMELINE_ENTRY_TYPE = {
  VERSEMENT: "VERSEMENT_PARTENAIRE",
  SOUSCRIPTION: "SOUSCRIPTION_PARTENAIRE",
} as const satisfies Record<string, PipeTimelineUserType>;

export type PlacementPartenaireJournalKind = keyof typeof PLACEMENT_PARTENAIRE_TIMELINE_ENTRY_TYPE;

export function placementOperationTypeForPartenaireJournal(
  kind: PlacementPartenaireJournalKind
): PlacementOperationType {
  return kind === "VERSEMENT" ? "VERSEMENT" : "SOUSCRIPTION";
}
