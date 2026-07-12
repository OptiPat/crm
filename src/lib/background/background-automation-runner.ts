import { invoke } from "@tauri-apps/api/core";
import { syncSharedNotes } from "@/lib/api/tauri-notes";
import { listBirthdaysToday } from "@/lib/api/tauri-birthday-telegram";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  getAppRuntimePrefs,
  type AppRuntimePrefs,
  trayAutomationTickEnabled,
} from "@/lib/api/tauri-app-runtime";
import {
  notifyStelliumExceltisChanged,
  scanStelliumExceltisEmails,
} from "@/lib/api/tauri-stellium-exceltis";
import { beginBackgroundActivity } from "@/lib/background-activity";
import type { BackgroundAutomationJob } from "@/lib/background/background-automation-intervals";
import {
  markAutomationJobRun,
  shouldRunAutomationJob,
} from "@/lib/background/background-automation-state";
import {
  notifyAutomationError,
  notifyAutomationEvent,
} from "@/lib/background/background-automation-notify";
import {
  birthdayNotificationsAlreadySentToday,
  formatBirthdayNotification,
  markBirthdayNotificationsSentToday,
} from "@/lib/background/birthday-automation-notify";
import { runRelationAutoSync } from "@/lib/emails/relation-auto-sync";
import { notifyNotesChanged } from "@/lib/notes/note-events";
import { processDuePipeRdvReminders } from "@/lib/pipe/pipe-rdv-reminder-processor";

export type AutomationSurface = "foreground" | "tray";

export type BackgroundAutomationCycleOptions = {
  surface: AutomationSurface;
  force?: boolean;
  jobs?: Partial<Record<BackgroundAutomationJob, boolean>>;
};

let cycleInFlight: Promise<void> | null = null;

function isTray(surface: AutomationSurface): boolean {
  return surface === "tray";
}

function jobEnabledInTray(
  prefs: AppRuntimePrefs,
  job: BackgroundAutomationJob
): boolean {
  if (!prefs.background_automations) return false;
  switch (job) {
    case "relation":
      return prefs.background_relation_sync;
    case "stellium":
      return prefs.background_stellium_scan;
    case "notes":
      return prefs.background_notes_sync;
    case "pipe_rdv":
      return prefs.background_pipe_rdv_reminders;
    case "birthdays":
      return prefs.background_birthday_notifications;
  }
}

function shouldRunJob(
  job: BackgroundAutomationJob,
  prefs: AppRuntimePrefs,
  options: BackgroundAutomationCycleOptions
): boolean {
  if (options.jobs?.[job] === false) return false;
  if (options.jobs?.[job] === true) {
    return shouldRunAutomationJob(job, { force: options.force });
  }
  if (isTray(options.surface) && !jobEnabledInTray(prefs, job)) return false;
  return shouldRunAutomationJob(job, { force: options.force });
}

async function runRelationJob(surface: AutomationSurface): Promise<void> {
  const tray = isTray(surface);
  const endActivity = beginBackgroundActivity("relation-sync");
  try {
    const result = await runRelationAutoSync();
    markAutomationJobRun("relation");
    if (!result.skipped && result.errors.length > 0) {
      console.warn("Sync relation:", result.errors.join(" ; "));
    }
    const changed =
      result.mail_detected > 0 ||
      result.rdv_campaign_detected > 0 ||
      result.calendar_accepted > 0 ||
      result.calendar_declined > 0 ||
      result.calendar_cancelled > 0;
    if (changed && tray) {
      const parts: string[] = [];
      if (result.mail_detected > 0) {
        parts.push(`${result.mail_detected} réponse(s) mail`);
      }
      if (result.rdv_campaign_detected > 0) {
        parts.push(`${result.rdv_campaign_detected} RDV campagne`);
      }
      if (result.calendar_cancelled > 0) {
        parts.push(`${result.calendar_cancelled} RDV annulé(s) (Agenda)`);
      }
      if (result.calendar_declined > 0) {
        parts.push(`${result.calendar_declined} refus Agenda`);
      }
      if (result.calendar_accepted > 0) {
        parts.push(`${result.calendar_accepted} acceptation(s) Agenda`);
      }
      await notifyAutomationEvent(
        "CRM W.Y.S — Sync mail & agenda",
        parts.join(" · "),
        { tray: true }
      );
    }
    if (result.errors.length > 0) {
      notifyAutomationError(
        "relation-sync",
        "CRM W.Y.S — Sync mail & agenda",
        result.errors[0] ?? "Erreur de synchronisation",
        { tray }
      );
    }
  } finally {
    endActivity();
  }
}

async function runPipeRdvJob(surface: AutomationSurface): Promise<void> {
  const tray = isTray(surface);
  const result = await processDuePipeRdvReminders(10);
  markAutomationJobRun("pipe_rdv");
  if (result.sent > 0 && tray) {
    await notifyAutomationEvent(
      "CRM W.Y.S — Rappel RDV Pipe",
      result.sent === 1
        ? "1 rappel email RDV envoyé."
        : `${result.sent} rappels email RDV envoyés.`,
      { tray: true }
    );
  }
  if (result.errors.length > 0) {
    notifyAutomationError(
      "pipe-rdv-reminder",
      "CRM W.Y.S — Rappel RDV Pipe",
      result.errors[0] ?? "Échec d'envoi",
      { tray }
    );
  }
}

async function runStelliumJob(surface: AutomationSurface): Promise<void> {
  const tray = isTray(surface);
  const endActivity = beginBackgroundActivity("stellium-scan");
  try {
    const status = await getEmailConnectionStatus();
    const mailReady =
      status.connected &&
      (status.provider === "google" || status.provider === "microsoft");
    if (!mailReady) {
      markAutomationJobRun("stellium");
      return;
    }
    const result = await scanStelliumExceltisEmails();
    markAutomationJobRun("stellium");
    notifyStelliumExceltisChanged();
    if (result.new_signals > 0) {
      const label =
        result.signals[result.signals.length - 1]?.millesime_label ?? "millésime";
      await notifyAutomationEvent(
        "CRM W.Y.S — Stellium Exceltis",
        `Remboursement détecté (${label}). Voir les notifications.`,
        { tray }
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (
      !msg.includes("Aucun compte") &&
      !msg.includes("connectez Google") &&
      !msg.includes("nécessite")
    ) {
      notifyAutomationError(
        "stellium-scan",
        "CRM W.Y.S — Stellium Exceltis",
        msg,
        { tray }
      );
    }
  } finally {
    endActivity();
  }
}

async function runNotesJob(): Promise<void> {
  const endActivity = beginBackgroundActivity("notes-sync");
  try {
    await syncSharedNotes();
    markAutomationJobRun("notes");
    notifyNotesChanged();
  } catch (error) {
    console.warn("Sync notes partagées:", error);
  } finally {
    endActivity();
  }
}

async function runBirthdaysJob(surface: AutomationSurface): Promise<void> {
  markAutomationJobRun("birthdays");
  if (birthdayNotificationsAlreadySentToday()) return;

  try {
    const contacts = await listBirthdaysToday();
    if (contacts.length === 0) return;

    const payload = formatBirthdayNotification(contacts);
    if (!payload) return;

    const sent = await notifyAutomationEvent(payload.title, payload.body, {
      tray: document.hidden,
    });
    if (sent) markBirthdayNotificationsSentToday();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    notifyAutomationError(
      "birthday-notify",
      "CRM W.Y.S — Anniversaires",
      msg,
      { tray: isTray(surface) }
    );
  }
}

async function runBackgroundAutomationCycleInner(
  options: BackgroundAutomationCycleOptions
): Promise<void> {
  let unlocked = false;
  try {
    unlocked = await invoke<boolean>("is_database_unlocked");
  } catch {
    return;
  }
  if (!unlocked) return;

  const prefs = await getAppRuntimePrefs();
  if (isTray(options.surface) && !trayAutomationTickEnabled(prefs)) return;

  if (shouldRunJob("relation", prefs, options)) {
    await runRelationJob(options.surface);
  }
  if (shouldRunJob("pipe_rdv", prefs, options)) {
    await runPipeRdvJob(options.surface);
  }
  if (shouldRunJob("stellium", prefs, options)) {
    await runStelliumJob(options.surface);
  }
  if (shouldRunJob("notes", prefs, options)) {
    await runNotesJob();
  }
  if (shouldRunJob("birthdays", prefs, options)) {
    await runBirthdaysJob(options.surface);
  }
}

/** Sync tray immédiate après déverrouillage (autostart minimisé). */
export function runBackgroundAutomationAfterUnlock(): void {
  if (typeof document !== "undefined" && !document.hidden) return;
  void runBackgroundAutomationCycle({ surface: "tray", force: true });
}

/** Exécute les automatisations dues (une file à la fois). */
export function runBackgroundAutomationCycle(
  options: BackgroundAutomationCycleOptions
): Promise<void> {
  if (cycleInFlight) return cycleInFlight;
  cycleInFlight = runBackgroundAutomationCycleInner(options).finally(() => {
    cycleInFlight = null;
  });
  return cycleInFlight;
}
