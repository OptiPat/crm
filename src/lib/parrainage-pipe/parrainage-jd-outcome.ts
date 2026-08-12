import {
  createParrainagePipeTimelineNote,
  getParrainagePipeById,
  setParrainagePipeStage,
  updateParrainagePipe,
  type ParrainagePipeRecord,
} from "@/lib/api/tauri-parrainage-pipe";
import { getFilleulDossier, upsertFilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import { createTache, getTachesByContact, setTacheStatut } from "@/lib/api/tauri-taches";
import {
  buildUpsertFilleulDossierInput,
  emptyFilleulDossier,
} from "@/lib/organisation/organisation-filleul-dossier";
import {
  formatParrainageInvitationDateLabel,
  formatParrainageInvitationSummaryFromPipe,
  formatParrainagePresenceConfirmationTaskTitle,
  localDateTimeInputToUnix,
  parrainagePresenceConfirmationDueUnix,
  PARRAINAGE_PRESENCE_CONFIRMATION_TASK_PREFIX,
} from "@/lib/parrainage-pipe/parrainage-call-schedule";
import {
  formatParrainageContactLabel,
  type ParrainageInvitationType,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";

export function isParrainagePresenceConfirmationTask(titre: string): boolean {
  return titre.startsWith(PARRAINAGE_PRESENCE_CONFIRMATION_TASK_PREFIX);
}

export async function completeOpenParrainagePresenceConfirmationTasks(
  contactId: number
): Promise<number> {
  const taches = await getTachesByContact(contactId);
  let completed = 0;
  for (const tache of taches) {
    if (tache.statut === "FAIT" || !isParrainagePresenceConfirmationTask(tache.titre)) {
      continue;
    }
    await setTacheStatut(tache.id, "FAIT");
    completed += 1;
  }
  return completed;
}

async function syncFilleulInvitationDate(contactId: number, invitationDateInput: string): Promise<void> {
  try {
    const dossier = await getFilleulDossier(contactId).catch(() => emptyFilleulDossier(contactId));
    await upsertFilleulDossier(
      buildUpsertFilleulDossierInput(dossier, { dateInvitation: invitationDateInput }),
      { notifyContactsChanged: true }
    );
  } catch {
    // Non bloquant.
  }
}

export async function scheduleParrainagePresenceConfirmationTask(
  pipe: ParrainagePipeRecord,
  invitationType: string,
  invitationDateInput: string
): Promise<boolean> {
  const kind =
    invitationType === "JD" || invitationType === "PO" ? invitationType : pipe.invitation_type;
  if (kind !== "JD" && kind !== "PO") return false;

  const confirmationDue = parrainagePresenceConfirmationDueUnix(invitationDateInput);
  const confirmationTitle = formatParrainagePresenceConfirmationTaskTitle(
    formatParrainageContactLabel(pipe),
    kind,
    invitationDateInput
  );
  if (confirmationDue == null || !confirmationTitle) return false;

  await createTache({
    contact_ids: [pipe.contact_id],
    titre: confirmationTitle,
    description: `Exercice ${pipe.exercice_label} — pipe parrainage #${pipe.id}. Rappel J-1 pour confirmer la présence.`,
    date_echeance: confirmationDue,
    priorite: "NORMALE",
    statut: "A_FAIRE",
  });
  return true;
}

export async function recordParrainageJdPresent(
  pipe: ParrainagePipeRecord,
  invitationSummary: string | null
): Promise<ParrainagePipeRecord> {
  await completeOpenParrainagePresenceConfirmationTasks(pipe.contact_id);
  const detail = invitationSummary ? ` (${invitationSummary})` : "";
  return setParrainagePipeStage(pipe.id, "PRESENT", {
    invitationType: (pipe.invitation_type as ParrainageInvitationType) ?? null,
    notes: `Présent à la JD/PO${detail}.`,
  });
}

export async function recordParrainageJdAbsentReschedule(
  pipe: ParrainagePipeRecord,
  newDateInput: string,
  invitationType: string
): Promise<ParrainagePipeRecord> {
  const trimmed = newDateInput.trim();
  const newDateLabel = formatParrainageInvitationDateLabel(trimmed);
  if (!newDateLabel) {
    throw new Error("Date de report invalide.");
  }

  const previousSummary = formatParrainageInvitationSummaryFromPipe(
    pipe.invitation_type,
    pipe.invitation_date
  );
  await completeOpenParrainagePresenceConfirmationTasks(pipe.contact_id);

  const updated = await updateParrainagePipe(pipe.id, {
    invitation_type: invitationType || pipe.invitation_type || null,
    invitation_date: localDateTimeInputToUnix(trimmed, "09:00"),
  });

  const note = previousSummary
    ? `Absent (${previousSummary}). Reporté au ${newDateLabel}.`
    : `Absent. Reporté au ${newDateLabel}.`;
  await createParrainagePipeTimelineNote(pipe.id, note);
  await syncFilleulInvitationDate(pipe.contact_id, trimmed);
  await scheduleParrainagePresenceConfirmationTask(updated, invitationType, trimmed);

  return getParrainagePipeById(pipe.id);
}

export async function recordParrainageJdAbsentNoDate(
  pipe: ParrainagePipeRecord,
  invitationSummary: string | null
): Promise<ParrainagePipeRecord> {
  await completeOpenParrainagePresenceConfirmationTasks(pipe.contact_id);
  const detail = invitationSummary ? ` (${invitationSummary})` : "";
  return setParrainagePipeStage(pipe.id, "REPORTE", {
    invitationType: (pipe.invitation_type as ParrainageInvitationType) ?? null,
    notes: `Absent${detail}. À replanifier — pas de nouvelle date.`,
  });
}

export async function recordParrainageJdAbandon(
  pipe: ParrainagePipeRecord,
  invitationSummary: string | null
): Promise<ParrainagePipeRecord> {
  await completeOpenParrainagePresenceConfirmationTasks(pipe.contact_id);
  const detail = invitationSummary ? ` (${invitationSummary})` : "";
  return setParrainagePipeStage(pipe.id, "REFUSE", {
    notes: `Abandon après absence${detail}.`,
  });
}

export async function replanifyParrainageWithNewDate(
  pipe: ParrainagePipeRecord,
  newDateInput: string,
  invitationType: string
): Promise<ParrainagePipeRecord> {
  const trimmed = newDateInput.trim();
  const newDateLabel = formatParrainageInvitationDateLabel(trimmed);
  if (!newDateLabel) {
    throw new Error("Date invalide.");
  }

  await updateParrainagePipe(pipe.id, {
    invitation_type: invitationType || pipe.invitation_type || null,
    invitation_date: localDateTimeInputToUnix(trimmed, "09:00"),
  });

  const updated = await setParrainagePipeStage(pipe.id, "CONFIRME", {
    invitationType: (invitationType || pipe.invitation_type) as ParrainageInvitationType | null,
    notes: `Nouvelle date fixée : ${newDateLabel}.`,
  });

  await syncFilleulInvitationDate(pipe.contact_id, trimmed);
  await scheduleParrainagePresenceConfirmationTask(updated, invitationType, trimmed);
  return getParrainagePipeById(pipe.id);
}
