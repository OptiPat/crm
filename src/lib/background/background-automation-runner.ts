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
import {
  notifyPlacementOperationsChanged,
  scanBoxPlacementEmails,
} from "@/lib/api/tauri-box-placement";
import { notifyPlacementConformeClientsAfterScan } from "@/lib/placement/placement-conforme-notify";
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
import { resolveRelationSyncNavTarget } from "@/lib/background/automation-notification-nav";
import {
  birthdayNotificationsAlreadySentToday,
  formatBirthdayNotification,
  markBirthdayNotificationsSentToday,
} from "@/lib/background/birthday-automation-notify";
import { runRelationAutoSync } from "@/lib/emails/relation-auto-sync";
import { notifyNotesChanged } from "@/lib/notes/note-events";
import { processDuePipeRdvReminders, formatPipeRdvScheduledEmailTrayNotify } from "@/lib/pipe/pipe-rdv-reminder-processor";
import { syncPipeGoogleRdvs } from "@/lib/api/tauri-calendar";
import { handlePipeGoogleAgendaSyncResult } from "@/lib/pipe/pipe-rdv-google-sync-reminders";
import { notifyPipeChanged } from "@/lib/pipe/pipe-events";
import { getTrayDigestSnapshot } from "@/lib/api/tauri-tray-digest";
import {
  decideTrayDigestNotification,
  loadTrayDigestNotifyState,
  persistTrayDigestNotifyState,
} from "@/lib/background/tray-digest-notify";
import { isCrmWindowHidden } from "@/lib/background/crm-window-visibility";

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
    case "box_placement":
      return prefs.background_stellium_scan;
    case "notes":
      return prefs.background_notes_sync;
    case "pipe_rdv":
      return prefs.background_pipe_rdv_reminders;
    case "birthdays":
      return prefs.background_birthday_notifications;
    case "tray_digest":
      return prefs.background_tray_digest;
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
        {
          tray: true,
          nav: resolveRelationSyncNavTarget({
            mail_detected: result.mail_detected,
            rdv_campaign_detected: result.rdv_campaign_detected,
            calendar_accepted: result.calendar_accepted,
            calendar_declined: result.calendar_declined,
            calendar_cancelled: result.calendar_cancelled,
          }),
        }
      );
    }
    if (result.errors.length > 0) {
      notifyAutomationError(
        "relation-sync",
        "CRM W.Y.S — Sync mail & agenda",
        result.errors[0] ?? "Erreur de synchronisation",
        { tray, nav: { page: "dashboard" } }
      );
    }
  } finally {
    endActivity();
  }
}

async function runPipeRdvJob(surface: AutomationSurface): Promise<number> {
  const tray = isTray(surface);
  try {
    const sync = await syncPipeGoogleRdvs();
    if ((sync.rescheduled ?? 0) > 0 || (sync.cancelled ?? 0) > 0) {
      await handlePipeGoogleAgendaSyncResult(sync);
      notifyPipeChanged();
      if (tray) {
        const parts: string[] = [];
        if (sync.rescheduled > 0) {
          parts.push(`${sync.rescheduled} RDV reporté(s)`);
        }
        if (sync.cancelled > 0) {
          parts.push(`${sync.cancelled} RDV annulé(s)`);
        }
        await notifyAutomationEvent(
          "CRM W.Y.S — Agenda Pipe",
          parts.join(" · "),
          { tray: true, nav: { page: "pipe" } }
        );
      }
    } else if ((sync.rescheduled_timeline_entry_ids?.length ?? 0) > 0) {
      await handlePipeGoogleAgendaSyncResult(sync);
      notifyPipeChanged();
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn("Sync Google Pipe:", msg);
    if (tray) {
      notifyAutomationError(
        "pipe-google-sync",
        "CRM W.Y.S — Agenda Pipe",
        msg,
        { tray: true, nav: { page: "pipe" } }
      );
    }
  }

  const result = await processDuePipeRdvReminders(10);
  markAutomationJobRun("pipe_rdv");
  const notify = formatPipeRdvScheduledEmailTrayNotify(result);
  if (notify && tray) {
    await notifyAutomationEvent(notify.title, notify.body, {
      tray: true,
      nav: { page: "pipe" },
    });
  }
  if (result.errors.length > 0) {
    notifyAutomationError(
      "pipe-rdv-reminder",
      "CRM W.Y.S — Email RDV Pipe",
      result.errors[0] ?? "Échec d'envoi",
      { tray, nav: { page: "pipe" } }
    );
  }
  return result.sent;
}

async function isMailProviderReady(): Promise<boolean> {
  const status = await getEmailConnectionStatus();
  return (
    status.connected &&
    (status.provider === "google" || status.provider === "microsoft")
  );
}

function isBenignMailSetupError(msg: string): boolean {
  return (
    msg.includes("Aucun compte") ||
    msg.includes("connectez Google") ||
    msg.includes("nécessite")
  );
}

async function runStelliumExceltisJob(surface: AutomationSurface): Promise<void> {
  const tray = isTray(surface);
  const endActivity = beginBackgroundActivity("stellium-scan");
  try {
    if (!(await isMailProviderReady())) {
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
        { tray, nav: { page: "suivi", tab: "etiquettes" } }
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!isBenignMailSetupError(msg)) {
      notifyAutomationError(
        "stellium-scan",
        "CRM W.Y.S — Stellium Exceltis",
        msg,
        { tray, nav: { page: "suivi", tab: "etiquettes" } }
      );
    }
  } finally {
    endActivity();
  }
}

async function runBoxPlacementJob(surface: AutomationSurface): Promise<void> {
  const tray = isTray(surface);
  const endActivity = beginBackgroundActivity("stellium-scan");
  try {
    if (!(await isMailProviderReady())) {
      markAutomationJobRun("box_placement");
      return;
    }
    const boxResult = await scanBoxPlacementEmails();
    markAutomationJobRun("box_placement");
    notifyPlacementOperationsChanged();
    await notifyPlacementConformeClientsAfterScan(boxResult.new_conforme_ids, { quiet: true });
    if (boxResult.created + boxResult.updated > 0) {
      await notifyAutomationEvent(
        "CRM W.Y.S — Box Placement",
        `${boxResult.created + boxResult.updated} opération(s) partenaire mise(s) à jour.`,
        { tray, nav: { page: "suivi", tab: "alertes" } }
      );
    }
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!isBenignMailSetupError(msg)) {
      console.warn("Box Placement scan:", msg);
      notifyAutomationError(
        "stellium-scan",
        "CRM W.Y.S — Box Placement",
        msg,
        { tray, nav: { page: "suivi", tab: "alertes" } }
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
  if (birthdayNotificationsAlreadySentToday()) return;

  const windowHidden = await isCrmWindowHidden();
  if (!isTray(surface) && !windowHidden) {
    // Fenêtre ouverte : ne pas consommer la notif du jour (toast in-app invisible au tray).
    return;
  }

  markAutomationJobRun("birthdays");

  try {
    const contacts = await listBirthdaysToday();
    if (contacts.length === 0) return;

    const payload = formatBirthdayNotification(contacts);
    if (!payload) return;

    const sent = await notifyAutomationEvent(payload.title, payload.body, {
      tray: true,
      nav: { page: "contacts" },
    });
    if (sent) markBirthdayNotificationsSentToday();
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    notifyAutomationError(
      "birthday-notify",
      "CRM W.Y.S — Anniversaires",
      msg,
      { tray: isTray(surface), nav: { page: "contacts" } }
    );
  }
}

async function runTrayDigestJob(
  surface: AutomationSurface,
  skipImminentRdv: boolean
): Promise<void> {
  if (!isTray(surface)) return;

  try {
    const snapshot = await getTrayDigestSnapshot();

    const digestSnapshot = skipImminentRdv
      ? { ...snapshot, pipe_rdvs_within_2h: [] }
      : snapshot;

    const state = loadTrayDigestNotifyState();
    const decision = decideTrayDigestNotification(digestSnapshot, {
      lastFingerprint: state.lastFingerprint,
      lastSentAtMs: state.lastSentAtMs,
      notifiedRdvIds: state.notifiedRdvIds,
    });
    if (!decision.shouldSend) return;

    markAutomationJobRun("tray_digest");

    const sent = await notifyAutomationEvent(decision.title, decision.body, {
      tray: true,
      nav: decision.navTarget,
    });
    if (!sent) return;

    const realImminentIds = snapshot.pipe_rdvs_within_2h.map((r) => r.calendar_event_id);
    /** Ne pas effacer l'état RDV quand le digest a omis les RDV (rappel Pipe même cycle). */
    const imminentIdsForPersist = skipImminentRdv
      ? realImminentIds
      : digestSnapshot.pipe_rdvs_within_2h.map((r) => r.calendar_event_id);
    const nextNotified = new Set(state.notifiedRdvIds);
    for (const id of decision.rdvIdsToMark) {
      nextNotified.add(id);
    }
    if (skipImminentRdv) {
      for (const id of realImminentIds) {
        nextNotified.add(id);
      }
    }
    persistTrayDigestNotifyState(
      decision.fingerprint,
      Date.now(),
      nextNotified,
      imminentIdsForPersist
    );
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    notifyAutomationError(
      "tray-digest",
      "CRM W.Y.S — Point du jour",
      msg,
      { tray: true, nav: { page: "dashboard" } }
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
  let pipeRdvRemindersSent = 0;
  if (shouldRunJob("pipe_rdv", prefs, options)) {
    pipeRdvRemindersSent = await runPipeRdvJob(options.surface);
  }
  if (shouldRunJob("stellium", prefs, options)) {
    await runStelliumExceltisJob(options.surface);
  }
  if (shouldRunJob("box_placement", prefs, options)) {
    await runBoxPlacementJob(options.surface);
  }
  if (shouldRunJob("notes", prefs, options)) {
    await runNotesJob();
  }
  if (shouldRunJob("birthdays", prefs, options)) {
    await runBirthdaysJob(options.surface);
  }
  if (shouldRunJob("tray_digest", prefs, options)) {
    await runTrayDigestJob(options.surface, pipeRdvRemindersSent > 0);
  }
}

/** Sync tray immédiate après déverrouillage (autostart minimisé). */
export function runBackgroundAutomationAfterUnlock(): void {
  void (async () => {
    if (!(await isCrmWindowHidden())) return;
    void runBackgroundAutomationCycle({ surface: "tray", force: true });
  })();
}

/** Cycle tray si la fenêtre est cachée (tick timer ou passage en tray). */
export async function runTrayAutomationCycleIfHidden(
  options: { force?: boolean } = {}
): Promise<void> {
  if (!(await isCrmWindowHidden())) return;
  await runBackgroundAutomationCycle({ surface: "tray", force: options.force });
}

/** Exécute les automatisations dues (une file à la fois). */
export function runBackgroundAutomationCycle(
  options: BackgroundAutomationCycleOptions
): Promise<void> {
  if (cycleInFlight) {
    if (!options.force) return cycleInFlight;
    const chained = cycleInFlight.finally(() =>
      runBackgroundAutomationCycleInner(options)
    );
    cycleInFlight = chained.finally(() => {
      cycleInFlight = null;
    });
    return chained;
  }
  cycleInFlight = runBackgroundAutomationCycleInner(options).finally(() => {
    cycleInFlight = null;
  });
  return cycleInFlight;
}
