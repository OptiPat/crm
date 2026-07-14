import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import {
  PIPE_TIMELINE_TYPE_LABELS,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import {
  defaultPipeTitreFromContact,
  formatPipeContactLabel,
  type PipeType,
} from "@/lib/pipe/pipe-types";

export const PIPE_TYPE_SUIVI: PipeType = "ACTE_GESTION";

/** Titre timeline d'un RDV de suivi (distinct de R1/R2/R3). */
export const SUIVI_RDV_TITRE = "Suivi";

/** Types journal rapide sur un pipe Suivi (hors actes Stellium — menu dédié). */
export const SUIVI_QUICK_ADD_TYPES = ["APPEL", "NOTE", "RDV"] as const satisfies readonly PipeTimelineUserType[];

/** Types journal historiques / legacy (arbitrage, réinvestissement déclarés avant le menu Stellium). */
export const SUIVI_TIMELINE_TYPES = [
  "APPEL",
  "ARBITRAGE",
  "REINVESTISSEMENT",
  "NOTE",
  "RDV",
] as const satisfies readonly PipeTimelineUserType[];

export type SuiviTimelineType = (typeof SUIVI_TIMELINE_TYPES)[number];
export type SuiviQuickAddType = (typeof SUIVI_QUICK_ADD_TYPES)[number];

export function isSuiviPipeType(pipeType: string | null | undefined): boolean {
  return pipeType === PIPE_TYPE_SUIVI;
}

export function isSuiviPipe(
  pipe: Pick<PipeRecord, "pipe_type"> | null | undefined
): boolean {
  return pipe != null && isSuiviPipeType(pipe.pipe_type);
}

export function isSuiviRdvEntry(
  entry: Pick<PipeTimelineEntryRecord, "entry_type" | "titre">
): boolean {
  return entry.entry_type === "RDV" && entry.titre?.trim() === SUIVI_RDV_TITRE;
}

export function formatSuiviRdvDisplayLabel(): string {
  return "RDV de suivi";
}

export function formatPipeSuiviRdvGoogleCalendarTitle(contactLabel: string): string {
  const contact = contactLabel.trim() || "Contact";
  return `RDV de suivi patrimonial - ${contact}`;
}

export function defaultSuiviPipeTitre(contact: {
  prenom?: string | null;
  nom?: string | null;
  contact_prenom?: string | null;
  contact_nom?: string | null;
}): string {
  const label = defaultPipeTitreFromContact(contact);
  const month = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
  return label !== "Contact" ? `${label} — suivi ${month}` : `Suivi ${month}`;
}

export function buildVersementAffaireTitre(
  suivi: Pick<PipeRecord, "contact_prenom" | "contact_nom" | "titre">
): string {
  const contact = formatPipeContactLabel(suivi);
  return contact !== "Contact"
    ? `Versement complémentaire — ${contact}`
    : "Versement complémentaire";
}

export function suiviTimelineTypeLabel(type: SuiviTimelineType): string {
  if (type === "RDV") return formatSuiviRdvDisplayLabel();
  return PIPE_TIMELINE_TYPE_LABELS[type];
}
