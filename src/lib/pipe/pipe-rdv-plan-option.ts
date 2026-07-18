import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";

/** Options de planification RDV affaire (titre timeline distinct pour les sous-types). */
export const PIPE_RDV_PLAN_OPTIONS = [
  "R1",
  "R2",
  "R2_PLACEMENT",
  "R2_IMMO",
  "R3",
  "R3_PLACEMENT",
  "R3_IMMO",
] as const;

export type PipeRdvPlanOption = (typeof PIPE_RDV_PLAN_OPTIONS)[number];

export const GENERIC_R2_ENTRY_TITRE = "R2";
export const R2_PLACEMENT_ENTRY_TITRE = "R2 Placement";
export const R2_IMMO_ENTRY_TITRE = "R2 Immo";

export const GENERIC_R3_ENTRY_TITRE = "R3";
export const R3_PLACEMENT_ENTRY_TITRE = "R3 Placements";
export const R3_IMMO_ENTRY_TITRE = "R3 Immo";

export const PIPE_RDV_PLAN_OPTION_LABELS: Record<PipeRdvPlanOption, string> = {
  R1: "R1",
  R2: GENERIC_R2_ENTRY_TITRE,
  R2_PLACEMENT: R2_PLACEMENT_ENTRY_TITRE,
  R2_IMMO: R2_IMMO_ENTRY_TITRE,
  R3: GENERIC_R3_ENTRY_TITRE,
  R3_PLACEMENT: R3_PLACEMENT_ENTRY_TITRE,
  R3_IMMO: R3_IMMO_ENTRY_TITRE,
};

export const R2_PLAN_OPTIONS: readonly PipeRdvPlanOption[] = [
  "R2",
  "R2_PLACEMENT",
  "R2_IMMO",
];

export const R3_PLAN_OPTIONS: readonly PipeRdvPlanOption[] = [
  "R3",
  "R3_PLACEMENT",
  "R3_IMMO",
];

export function isPipeRdvPlanOption(value: string): value is PipeRdvPlanOption {
  return (PIPE_RDV_PLAN_OPTIONS as readonly string[]).includes(value);
}

export function formatRdvPlanOptionLabel(option: PipeRdvPlanOption): string {
  return PIPE_RDV_PLAN_OPTION_LABELS[option];
}

export function rdvStageFromPlanOption(option: PipeRdvPlanOption): PipeRdvStage {
  if (option === "R2_PLACEMENT" || option === "R2_IMMO") return "R2";
  if (option === "R3_PLACEMENT" || option === "R3_IMMO") return "R3";
  return option;
}

export function rdvEntryTitreFromPlanOption(option: PipeRdvPlanOption): string {
  return PIPE_RDV_PLAN_OPTION_LABELS[option];
}

export function defaultPlanOptionForRdvStage(stage: PipeRdvStage): PipeRdvPlanOption {
  return stage;
}

export function planOptionsForRdvStage(stage: PipeRdvStage): readonly PipeRdvPlanOption[] {
  if (stage === "R2") return R2_PLAN_OPTIONS;
  if (stage === "R3") return R3_PLAN_OPTIONS;
  return [stage];
}

export function stageHasPlanVariants(stage: PipeRdvStage): boolean {
  return stage === "R2" || stage === "R3";
}

export function rdvPlanOptionFromEntryTitre(
  titre: string | null | undefined
): PipeRdvPlanOption | null {
  const raw = titre?.trim() ?? "";
  if (raw === R2_PLACEMENT_ENTRY_TITRE) return "R2_PLACEMENT";
  if (raw === R2_IMMO_ENTRY_TITRE) return "R2_IMMO";
  if (raw === R3_PLACEMENT_ENTRY_TITRE) return "R3_PLACEMENT";
  if (raw === R3_IMMO_ENTRY_TITRE) return "R3_IMMO";
  if (isPipeRdvPlanOption(raw)) return raw;
  return null;
}

export function isGenericR2EntryTitre(titre: string | null | undefined): boolean {
  return titre?.trim() === GENERIC_R2_ENTRY_TITRE;
}

export function isGenericR3EntryTitre(titre: string | null | undefined): boolean {
  return titre?.trim() === GENERIC_R3_ENTRY_TITRE;
}

export function isTypifiableR2Entry(entry: {
  entry_type: string;
  titre?: string | null;
}): boolean {
  return entry.entry_type === "RDV" && isGenericR2EntryTitre(entry.titre);
}

export function isTypifiableR3Entry(entry: {
  entry_type: string;
  titre?: string | null;
}): boolean {
  return entry.entry_type === "RDV" && isGenericR3EntryTitre(entry.titre);
}

export function isR3PlacementsRdvPlanOption(option: PipeRdvPlanOption): boolean {
  return option === "R3" || option === "R3_PLACEMENT";
}

export function isR3PlacementsRdvEntryTitre(titre: string | null | undefined): boolean {
  const option = rdvPlanOptionFromEntryTitre(titre);
  return option != null && isR3PlacementsRdvPlanOption(option);
}

export function isR3ImmoRdvPlanOption(option: PipeRdvPlanOption): boolean {
  return option === "R3_IMMO";
}

export function isR3ImmoRdvEntryTitre(titre: string | null | undefined): boolean {
  const option = rdvPlanOptionFromEntryTitre(titre);
  return option != null && isR3ImmoRdvPlanOption(option);
}

export type R2TypifyTarget = Extract<PipeRdvPlanOption, "R2_PLACEMENT" | "R2_IMMO">;
export type R3TypifyTarget = Extract<PipeRdvPlanOption, "R3_PLACEMENT" | "R3_IMMO">;

export const R2_TYPIFY_TARGETS: readonly R2TypifyTarget[] = ["R2_PLACEMENT", "R2_IMMO"];
export const R3_TYPIFY_TARGETS: readonly R3TypifyTarget[] = ["R3_PLACEMENT", "R3_IMMO"];
