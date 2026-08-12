import {
  PARRAINAGE_PIPE_STAGE_LABELS,
  type ParrainagePipeStage,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";

/** Message utilisateur pour les erreurs invoke / DB du pipe parrainage. */
export function formatParrainagePipeError(error: unknown): string {
  const raw = String(error);

  if (raw.includes("date d'invitation JD/PO requise")) {
    return "Choisissez la date de la JD ou de la PO avant de passer à « Oui, je viens ».";
  }

  if (raw.includes("type d'invitation JD ou PO requis")) {
    if (raw.includes("« Oui, je viens »")) {
      return "Pour passer à l'étape « Oui, je viens », choisissez le type d'invitation : Journée Découverte (JD) ou Présentation d'opportunité (PO).";
    }
    return `Pour passer à l'étape « ${PARRAINAGE_PIPE_STAGE_LABELS.CONFIRME} » ou « ${PARRAINAGE_PIPE_STAGE_LABELS.PRESENT} », choisissez le type d'invitation : Journée Découverte (JD) ou Présentation d'opportunité (PO).`;
  }

  if (raw.includes("étape invalide")) {
    return "Étape du pipe parrainage invalide.";
  }

  if (raw.includes("contact introuvable")) {
    return "Contact introuvable — impossible de modifier ce pipe.";
  }

  return raw.replace(/^Failed to (?:set|update|create) parrainage pipe(?: stage)?:\s*/i, "");
}

export function parrainageInvitationRequiredMessage(targetStage: ParrainagePipeStage): string {
  const label = PARRAINAGE_PIPE_STAGE_LABELS[targetStage];
  return `Choisissez le type d'invitation (JD ou PO) avant de passer à « ${label} ».`;
}

export function parrainageInvitationDateRequiredMessage(): string {
  return "Choisissez la date de la JD ou de la PO.";
}
