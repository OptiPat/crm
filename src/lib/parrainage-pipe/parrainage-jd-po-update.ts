/** Heure locale à partir de laquelle l'issue JD/PO doit être saisie le jour J. */
export const PARRAINAGE_JD_PO_OUTCOME_UPDATE_HOUR = 18;

export type ParrainageJdPoOutcomeCheckPipe = {
  stage: string;
  invitation_date?: number | null;
};

/** Timestamp Unix : jour de la JD/PO à 18h locale (aligné sur invitation_date en 09:00 locale). */
export function parrainageJdPoOutcomeUpdateDueUnix(invitationDateUnix: number): number {
  const inv = new Date(invitationDateUnix * 1000);
  const dueMs = new Date(
    inv.getFullYear(),
    inv.getMonth(),
    inv.getDate(),
    PARRAINAGE_JD_PO_OUTCOME_UPDATE_HOUR,
    0,
    0,
    0
  ).getTime();
  return Math.floor(dueMs / 1000);
}

/** Pipe en « Oui, je viens » dont la JD/PO a eu lieu (≥ 18h le jour J) sans issue saisie. */
export function parrainagePipeNeedsJdPoOutcomeUpdate(
  pipe: ParrainageJdPoOutcomeCheckPipe,
  nowMs: number = Date.now()
): boolean {
  if (pipe.stage !== "CONFIRME") return false;
  if (pipe.invitation_date == null) return false;
  const dueUnix = parrainageJdPoOutcomeUpdateDueUnix(pipe.invitation_date);
  return nowMs / 1000 >= dueUnix;
}
