import type { ParrainagePipeTimelineEntry } from "@/lib/api/tauri-parrainage-pipe";
import {
  PARRAINAGE_INVITATION_LABELS,
  type ParrainageInvitationType,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";
import { dateInputAddDays } from "@/lib/taches/tache-date-shortcuts";

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

/** Demain 18:00 local — défaut pour planifier l'appel après rebond SMS. */
export function defaultParrainageCallSchedule(nowMs: number = Date.now()): {
  dateInput: string;
  timeInput: string;
} {
  const tomorrowInput = dateInputAddDays(null, 1, nowMs);
  const d = new Date(nowMs);
  d.setDate(d.getDate() + 1);
  const localTomorrow = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return {
    dateInput: localTomorrow || tomorrowInput,
    timeInput: "18:00",
  };
}

/** Date + heure locales (`YYYY-MM-DD`, `HH:mm`) → timestamp Unix. */
export function localDateTimeInputToUnix(
  dateInput: string,
  timeInput: string
): number | null {
  const trimmedDate = dateInput.trim();
  if (!trimmedDate) return null;
  const [year, month, day] = trimmedDate.split("-").map(Number);
  const [hour, minute] = (timeInput.trim() || "18:00").split(":").map(Number);
  if (!year || !month || !day) return null;
  const ms = new Date(year, month - 1, day, hour || 0, minute || 0, 0, 0).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.floor(ms / 1000);
}

/** Prochain samedi local — suggestion pour préremplir le script d'appel. */
export function defaultNextSaturdayDateInput(nowMs: number = Date.now()): string {
  const d = new Date(nowMs);
  const day = d.getDay();
  const offset = day === 6 ? 7 : (6 - day + 7) % 7;
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

const PLANNED_CALL_LINE_RE = /Appel planifié\s*:\s*(.+)/i;
const INVITATION_DATE_LINE_RE = /Date (?:JD\/PO|invitation)\s*:\s*(.+)/i;

/** Extrait le libellé d'appel planifié depuis les notes de rebond SMS. */
export function extractPlannedCallLabelFromTimeline(
  timeline: ParrainagePipeTimelineEntry[]
): string | null {
  for (const entry of timeline) {
    const content = entry.contenu ?? "";
    const match = content.match(PLANNED_CALL_LINE_RE);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

/** Extrait la date d'invitation JD/PO depuis la note d'appel effectué. */
export function extractInvitationDateLabelFromTimeline(
  timeline: ParrainagePipeTimelineEntry[]
): string | null {
  for (const entry of timeline) {
    const content = entry.contenu ?? "";
    const match = content.match(INVITATION_DATE_LINE_RE);
    if (match?.[1]?.trim()) {
      return match[1].trim();
    }
  }
  return null;
}

/** Libellé FR pour l'historique pipe (ex. « 8 août 2026 à 18:00 »). */
export function formatParrainageCallScheduleLabel(
  dateInput: string,
  timeInput: string
): string | null {
  const unix = localDateTimeInputToUnix(dateInput, timeInput);
  if (unix == null) return null;
  return new Date(unix * 1000).toLocaleString("fr-FR", {
    dateStyle: "long",
    timeStyle: "short",
  });
}

/** Libellé FR date seule (ex. « samedi 16 août 2026 »). */
export function formatParrainageInvitationDateLabel(dateInput: string): string | null {
  const unix = localDateTimeInputToUnix(dateInput, "09:00");
  if (unix == null) return null;
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Segment court pour le script d'appel (ex. « 16 août »). */
export function formatParrainageScriptInvitationDate(dateInput: string): string {
  const unix = localDateTimeInputToUnix(dateInput, "09:00");
  if (unix == null) return "[X]";
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
  });
}

/** Résumé affiché après confirmation (ex. « Journée Découverte — samedi 16 août 2026 »). */
export function formatParrainageInvitationSummary(
  invitationType: ParrainageInvitationType | string,
  dateInput: string
): string | null {
  const typeLabel =
    invitationType in PARRAINAGE_INVITATION_LABELS
      ? PARRAINAGE_INVITATION_LABELS[invitationType as ParrainageInvitationType]
      : invitationType.trim();
  if (!typeLabel) return null;
  const dateLabel = formatParrainageInvitationDateLabel(dateInput);
  return dateLabel ? `${typeLabel} — ${dateLabel}` : typeLabel;
}

/** `YYYY-MM-DD` depuis un timestamp Unix (début de journée locale). */
export function parrainageInvitationDateToInput(unix: number | null | undefined): string {
  if (unix == null) return "";
  const d = new Date(unix * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Libellé FR depuis le timestamp pipe (ex. « samedi 16 août 2026 »). */
export function formatParrainageInvitationDateFromUnix(
  unix: number | null | undefined
): string | null {
  if (unix == null) return null;
  return new Date(unix * 1000).toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/** Résumé JD/PO depuis la fiche pipe. */
export function formatParrainageInvitationSummaryFromPipe(
  invitationType: ParrainageInvitationType | string | null | undefined,
  invitationDateUnix: number | null | undefined
): string | null {
  if (!invitationType) return null;
  const typeLabel =
    invitationType in PARRAINAGE_INVITATION_LABELS
      ? PARRAINAGE_INVITATION_LABELS[invitationType as ParrainageInvitationType]
      : String(invitationType).trim();
  const dateLabel = formatParrainageInvitationDateFromUnix(invitationDateUnix);
  return dateLabel ? `${typeLabel} — ${dateLabel}` : typeLabel;
}

const PRESENCE_CONFIRMATION_HOUR = 9;

/** Préfixe des tâches auto J-1 (aligné Rust `PRESENCE_CONFIRMATION_TASK_TITLE_PREFIX`). */
export const PARRAINAGE_PRESENCE_CONFIRMATION_TASK_PREFIX = "Confirmer la présence de ";

/**
 * Échéance pour la tâche « confirmer la présence » : veille de la JD/PO à 9h locale.
 * Si cette échéance est déjà passée mais l'invitation est future, retourne « maintenant » (+1 min).
 */
export function parrainagePresenceConfirmationDueUnix(
  invitationDateInput: string,
  nowMs: number = Date.now()
): number | null {
  const trimmed = invitationDateInput.trim();
  if (!trimmed) return null;
  const [year, month, day] = trimmed.split("-").map(Number);
  if (!year || !month || !day) return null;

  const invitationDayStartMs = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
  const todayStartMs = new Date(nowMs);
  todayStartMs.setHours(0, 0, 0, 0);
  if (invitationDayStartMs < todayStartMs.getTime()) {
    return null;
  }

  const dueMs = new Date(
    year,
    month - 1,
    day - 1,
    PRESENCE_CONFIRMATION_HOUR,
    0,
    0,
    0
  ).getTime();

  if (dueMs < nowMs) {
    return Math.floor((nowMs + 60_000) / 1000);
  }
  return Math.floor(dueMs / 1000);
}

/** Titre de tâche auto — ex. « Confirmer la présence de Jean DUPONT à la JD du samedi 16 août 2026 ». */
export function formatParrainagePresenceConfirmationTaskTitle(
  contactLabel: string,
  invitationType: ParrainageInvitationType | string,
  invitationDateInput: string
): string | null {
  const kind = invitationType === "JD" || invitationType === "PO" ? invitationType : null;
  const label = contactLabel.trim();
  if (!kind || !label) return null;
  const dateLabel = formatParrainageInvitationDateLabel(invitationDateInput);
  if (!dateLabel) return null;
  return `Confirmer la présence de ${label} à la ${kind} du ${dateLabel}`;
}
