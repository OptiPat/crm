export const PARRAINAGE_PIPE_STAGES = [
  "A_CONTACTER",
  "PRISE_DE_CONTACT",
  "CONFIRME",
  "PRESENT",
  "INSCRIT",
  "REFUSE",
] as const;

export type ParrainagePipeStage = (typeof PARRAINAGE_PIPE_STAGES)[number];

export const PARRAINAGE_PIPE_STAGE_LABELS: Record<ParrainagePipeStage, string> = {
  A_CONTACTER: "À contacter",
  PRISE_DE_CONTACT: "Prise de contact",
  CONFIRME: "Oui, je viens",
  PRESENT: "Présent JD/PO",
  INSCRIT: "Inscrit",
  REFUSE: "Refusé / abandonné",
};

export const PARRAINAGE_PIPE_BOARD_STAGES = [
  "A_CONTACTER",
  "PRISE_DE_CONTACT",
  "CONFIRME",
  "PRESENT",
  "INSCRIT",
  "REFUSE",
] as const satisfies readonly ParrainagePipeStage[];

export const PARRAINAGE_INVITATION_TYPES = ["JD", "PO"] as const;
export type ParrainageInvitationType = (typeof PARRAINAGE_INVITATION_TYPES)[number];

export const PARRAINAGE_INVITATION_LABELS: Record<ParrainageInvitationType, string> = {
  JD: "Journée Découverte",
  PO: "Présentation d'opportunité",
};

export function isParrainagePipeStage(value: string): value is ParrainagePipeStage {
  return (PARRAINAGE_PIPE_STAGES as readonly string[]).includes(value);
}

export function stageNeedsInvitationType(stage: ParrainagePipeStage): boolean {
  return stage === "CONFIRME" || stage === "PRESENT";
}

export function formatParrainageContactLabel(pipe: {
  contact_prenom?: string | null;
  contact_nom?: string | null;
}): string {
  const prenom = pipe.contact_prenom?.trim() ?? "";
  const nom = pipe.contact_nom?.trim() ?? "";
  return [prenom, nom].filter(Boolean).join(" ") || "Contact";
}
