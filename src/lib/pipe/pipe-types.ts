export const PIPE_TYPES = ["AFFAIRE", "ACTE_GESTION", "ACTION"] as const;

export type PipeType = (typeof PIPE_TYPES)[number];

export const PIPE_TYPE_LABELS: Record<PipeType, string> = {
  AFFAIRE: "Affaire",
  ACTE_GESTION: "Acte de gestion",
  ACTION: "Action",
};

export const PIPE_STAGES = [
  "PROSPECTION",
  "R1",
  "R2",
  "R3",
  "GAGNEE",
  "PERDUE_OU_EN_ATTENTE",
] as const;

export type PipeStage = (typeof PIPE_STAGES)[number];

export const PIPE_STAGE_LABELS: Record<PipeStage, string> = {
  PROSPECTION: "Prospection",
  R1: "R1",
  R2: "R2",
  R3: "R3",
  GAGNEE: "Gagnée",
  PERDUE_OU_EN_ATTENTE: "Perdue ou en attente",
};

/** Explications CGP pour l’UI (champ « avancement » des affaires). */
export const PIPE_STAGE_DESCRIPTIONS: Record<PipeStage, string> = {
  PROSPECTION: "Piste identifiée, premier échange à venir ou en cours.",
  R1: "Premier rendez-vous (découverte / qualification).",
  R2: "Second rendez-vous (approfondissement, proposition).",
  R3: "Troisième rendez-vous (closing ou arbitrage final).",
  GAGNEE: "Accord obtenu — signature ou souscription à suivre.",
  PERDUE_OU_EN_ATTENTE: "Projet refusé, gelé ou en stand-by sans date.",
};

export const PIPE_TYPE_DESCRIPTIONS: Record<PipeType, string> = {
  AFFAIRE: "Opportunité commerciale (produit, montant, closing).",
  ACTE_GESTION: "Dossier cadre regroupant plusieurs actions ou affaires.",
  ACTION: "Étape ponctuelle : appel, relance, RDV…",
};

/** Libellé UI du champ stage (évite le jargon « stage »). */
export const PIPE_STAGE_FIELD_LABEL = "Avancement";

export function isPipeType(value: string): value is PipeType {
  return (PIPE_TYPES as readonly string[]).includes(value);
}

export function isPipeStage(value: string): value is PipeStage {
  return (PIPE_STAGES as readonly string[]).includes(value);
}

export function pipeTypeUsesStage(pipeType: PipeType): boolean {
  return pipeType === "AFFAIRE";
}

export function canBePipeParent(pipeType: PipeType): boolean {
  return pipeType === "AFFAIRE" || pipeType === "ACTE_GESTION";
}

export function defaultPipeStage(pipeType: PipeType): PipeStage | "" {
  return pipeType === "AFFAIRE" ? "PROSPECTION" : "";
}

/** Étapes linéaires du funnel commercial (hors « perdue / en attente »). */
export const PIPE_LINEAR_STAGES = [
  "PROSPECTION",
  "R1",
  "R2",
  "R3",
  "GAGNEE",
] as const satisfies readonly PipeStage[];

export type PipeLinearStage = (typeof PIPE_LINEAR_STAGES)[number];

export function getLinearStageIndex(stage: PipeStage): number {
  return PIPE_LINEAR_STAGES.indexOf(stage as PipeLinearStage);
}

export function getNextLinearStage(current: PipeStage): PipeLinearStage | null {
  const idx = getLinearStageIndex(current);
  if (idx < 0 || idx >= PIPE_LINEAR_STAGES.length - 1) return null;
  return PIPE_LINEAR_STAGES[idx + 1];
}

export function isTerminalPipeStage(stage: PipeStage): boolean {
  return stage === "GAGNEE" || stage === "PERDUE_OU_EN_ATTENTE";
}

export function formatStageAdvancementMessage(stage: PipeStage): string {
  return `Avancement passé à ${PIPE_STAGE_LABELS[stage]}`;
}

export function formatPipeContactLabel(
  pipe: Pick<PipeRecordLike, "contact_prenom" | "contact_nom">
): string {
  const prenom = pipe.contact_prenom?.trim() ?? "";
  const nom = pipe.contact_nom?.trim() ?? "";
  return [prenom, nom].filter(Boolean).join(" ") || "Contact";
}

export interface PipeRecordLike {
  contact_prenom?: string | null;
  contact_nom?: string | null;
}

export function validatePipeForm(input: {
  titre: string;
  contactId: number;
  pipeType: PipeType;
  stage: string;
}): string | null {
  if (!input.titre.trim()) return "Le titre est obligatoire.";
  if (!input.contactId) return "Le contact est obligatoire.";
  if (!isPipeType(input.pipeType)) return "Type invalide.";
  if (pipeTypeUsesStage(input.pipeType) && !isPipeStage(input.stage)) {
    return "Avancement invalide pour une affaire.";
  }
  return null;
}
