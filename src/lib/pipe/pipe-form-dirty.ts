import type { PipeStage } from "@/lib/pipe/pipe-types";

export type PipeFormSnapshot = {
  contactId: number;
  secondaryContactId: number;
  pipeType: string;
  parentPipeId: number | null;
  titre: string;
  stage: PipeStage | "";
  notes: string;
};

export function isPipeFormDirty(
  initial: PipeFormSnapshot,
  current: PipeFormSnapshot
): boolean {
  return (
    initial.contactId !== current.contactId ||
    initial.secondaryContactId !== current.secondaryContactId ||
    initial.pipeType !== current.pipeType ||
    initial.parentPipeId !== current.parentPipeId ||
    initial.titre.trim() !== current.titre.trim() ||
    initial.stage !== current.stage ||
    initial.notes.trim() !== current.notes.trim()
  );
}

const PIPE_FORM_KEYS = [
  "contactId",
  "secondaryContactId",
  "pipeType",
  "parentPipeId",
  "titre",
  "stage",
  "notes",
] as const satisfies readonly (keyof PipeFormSnapshot)[];

function sameFieldValue(a: unknown, b: unknown): boolean {
  if (typeof a === "string" && typeof b === "string") return a.trim() === b.trim();
  return a === b;
}

/**
 * Rechargement du même pipe pendant une saisie : les champs non touchés
 * (valeur courante = valeur initiale) prennent la nouvelle valeur, et la
 * référence initiale suit ; les champs modifiés par l'utilisateur sont gardés.
 */
export function mergePipeFormOnReload<T extends PipeFormSnapshot>(
  initial: T,
  current: T,
  incoming: T
): { form: T; initial: T } {
  const form = { ...current };
  const nextInitial = { ...initial };
  for (const key of PIPE_FORM_KEYS) {
    if (!sameFieldValue(initial[key], current[key])) continue;
    (form as PipeFormSnapshot)[key] = incoming[key] as never;
    (nextInitial as PipeFormSnapshot)[key] = incoming[key] as never;
  }
  return { form, initial: nextInitial };
}

/** Options de la fenêtre « modifications non enregistrées » (useConfirmDialog). */
export const PIPE_FORM_DISCARD_CONFIRM = {
  title: "Quitter sans enregistrer ?",
  description: "Vos modifications seront perdues.",
  confirmLabel: "Quitter sans enregistrer",
  cancelLabel: "Continuer l'édition",
  destructive: true,
} as const;
