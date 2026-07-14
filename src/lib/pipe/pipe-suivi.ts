import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import {
  PIPE_TIMELINE_TYPE_LABELS,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import {
  defaultPipeTitreFromContact,
  formatPipeContactLabel,
  PIPE_STAGE_LABELS,
  type PipeStage,
  type PipeType,
} from "@/lib/pipe/pipe-types";
import {
  getPipeStageBadgeClasses,
} from "@/lib/pipe/pipe-stage-colors";

export const PIPE_TYPE_SUIVI: PipeType = "ACTE_GESTION";

/** Titre timeline d'un RDV de suivi (distinct de R1/R2/R3). */
export const SUIVI_RDV_TITRE = "Suivi";

/** Option UI Suivi : ouvre une affaire enfant (pas un libellé mail Stellium). */
export const VERSEMENT_COMPLEMENTAIRE_ACT_LABEL = "Versement complémentaire";

export function isVersementComplementaireActLabel(label: string): boolean {
  return label.trim() === VERSEMENT_COMPLEMENTAIRE_ACT_LABEL;
}

/** Affaire enfant d'un Suivi ouverte via versement complémentaire (CA sans cycle commercial). */
export function isVersementComplementaireAffaire(
  pipe: Pick<PipeRecord, "pipe_type" | "parent_pipe_id" | "titre">
): boolean {
  if (pipe.pipe_type !== "AFFAIRE") return false;
  if (pipe.parent_pipe_id == null || pipe.parent_pipe_id <= 0) return false;
  const titre = pipe.titre.trim();
  return (
    titre === VERSEMENT_COMPLEMENTAIRE_ACT_LABEL ||
    titre.startsWith(`${VERSEMENT_COMPLEMENTAIRE_ACT_LABEL} —`)
  );
}

export function defaultVersementComplementaireAffaireStage(): PipeStage {
  return "PROSPECTION";
}

/** Libellé badge tant que l'affaire versement n'est pas « Gagnée » (mail client). */
export const VERSEMENT_COMPLEMENTAIRE_AFFAIRE_STAGE_LABEL = "Versement en cours";

export function formatVersementComplementaireAffaireStageLabel(
  pipe: Pick<PipeRecord, "pipe_type" | "parent_pipe_id" | "titre" | "stage">
): string | null {
  if (!isVersementComplementaireAffaire(pipe)) return null;
  if (pipe.stage === "GAGNEE") return PIPE_STAGE_LABELS.GAGNEE;
  return VERSEMENT_COMPLEMENTAIRE_AFFAIRE_STAGE_LABEL;
}

export function versementComplementaireAffaireStageBadgeClasses(stage: PipeStage): string {
  if (stage === "GAGNEE") return getPipeStageBadgeClasses("GAGNEE");
  return getPipeStageBadgeClasses("R2");
}

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
