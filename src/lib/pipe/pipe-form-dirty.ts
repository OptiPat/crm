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

export function confirmDiscardPipeFormEdits(): boolean {
  return window.confirm(
    "Des modifications non enregistrées seront perdues. Continuer sans enregistrer ?"
  );
}
