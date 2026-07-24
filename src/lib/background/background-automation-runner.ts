import { invoke } from "@tauri-apps/api/core";
import { listBirthdaysToday } from "@/lib/api/tauri-birthday-telegram";
import { getEmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import {
  claimBackgroundAutomationLease,
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
  MAIL_UNAVAILABLE_RETRY_MS,
  boxPlacementAutoScanEnabled,
  getJobIntervalMs,
  stelliumAutoScanEnabled,
} from "@/lib/background/background-automation-intervals";
import {
  automationJobAttemptCooldownRemainingMs,
  markAutomationJobAttempt,
  markAutomationJobRun,
  shouldRunAutomationJob,
} from "@/lib/background/background-automation-state";
import { recordAutomationJobStat } from "@/lib/background/background-automation-stats";
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
let pendingCycleOptions: BackgroundAutomationCycleOptions[] = [];

function mergeCycleJobs(
  a?: Partial<Record<BackgroundAutomationJob, boolean>>,
  b?: Partial<Record<BackgroundAutomationJob, boolean>>
): Partial<Record<BackgroundAutomationJob, boolean>> | undefined {
  // `jobs` absent signifie cycle complet : il doit rester complet.
  if (!a || !b) return undefined;
  const merged: Partial<Record<BackgroundAutomationJob, boolean>> = {};
  const jobs = new Set([
    ...(Object.keys(a) as BackgroundAutomationJob[]),
    ...(Object.keys(b) as BackgroundAutomationJob[]),
  ]);
  for (const job of jobs) {
    merged[job] = a[job] === true || b[job] === true;
  }
  return merged;
}

export function mergeAutomationCycleOptionsForTests(
  a: BackgroundAutomationCycleOptions,
  b: BackgroundAutomationCycleOptions
): BackgroundAutomationCycleOptions | null {
  if (a.surface !== b.surface) return null;
  return {
    surface: a.surface,
    force: a.force || b.force,
    jobs: mergeCycleJobs(a.jobs, b.jobs),
  };
}

function enqueuePendingCycle(options: BackgroundAutomationCycleOptions): void {
  const index = pendingCycleOptions.findIndex(
    (pending) => pending.surface === options.surface
  );
  if (index >= 0) {
    pendingCycleOptions[index] =
      mergeAutomationCycleOptionsForTests(pendingCycleOptions[index], options) ?? options;
  } else if (options.force) {
    pendingCycleOptions.unshift(options);
  } else {
    pendingCycleOptions.push(options);
  }
}

function drainPendingCycle(): void {
  const next = pendingCycleOptions.shift();
  if (next) void runBackgroundAutomationCycle(next);
}

export function isBackgroundAutomationCycleInFlight(): boolean {
  return cycleInFlight != null || pendingCycleOptions.length > 0;
}

/** Attend une période réellement idle (évite la course avec un cycle qui démarre juste après). */
export async function waitForBackgroundAutomationCycleIdle(
  maxMs = 600_000,
  settleMs = 1_000
): Promise<boolean> {
  const step = 500;
  let waited = 0;
  let idleFor = 0;
  while (waited < maxMs) {
    await new Promise((resolve) => setTimeout(resolve, step));
    waited += step;
    if (isBackgroundAutomationCycleInFlight()) {
      idleFor = 0;
    } else {
      idleFor += step;
      if (idleFor >= settleMs) return true;
    }
  }
  return false;
}

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
    case "box_placement":
      return prefs.background_box_placement_scan;
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
  if (!isTray(options.surface) && !prefs.foreground_automations) return false;
  if (job === "stellium" && !stelliumAutoScanEnabled(prefs)) {
    return false;
  }
  if (job === "box_placement" && !boxPlacementAutoScanEnabled(prefs)) {
    return false;
  }
  if (
    !options.force &&
    (job === "relation" || job === "stellium" || job === "box_placement") &&
    automationJobAttemptCooldownRemainingMs(job, MAIL_UNAVAILABLE_RETRY_MS) > 0
  ) {
    return false;
  }
  const intervalMs = getJobIntervalMs(prefs, job);
  if (options.jobs?.[job] === true) {
    return shouldRunAutomationJob(job, {
      force: options.force,
      minIntervalMs: intervalMs,
    });
  }
  if (isTray(options.surface) && !jobEnabledInTray(prefs, job)) return false;
  return shouldRunAutomationJob(job, {
    force: options.force,
    minIntervalMs: intervalMs,
  });
}

async function runRelationJob(surface: AutomationSurface): Promise<void> {
  const tray = isTray(surface);
  const endActivity = beginBackgroundActivity("relation-sync");
  const startedAt = Date.now();
  try {
    const result = await runRelationAutoSync();
    if (result.skipped) {
      markAutomationJobAttempt("relation");
    } else {
      markAutomationJobRun("relation");
    }
    recordAutomationJobStat("relation", {
      durationMs: Date.now() - startedAt,
      detail: result.skipped
        ? "Boîte mail non connectée"
        : `${result.mail_detected} réponse(s), sync campagnes`,
    });
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
  const startedAt = Date.now();
  try {
    if (!(await isMailProviderReady())) {
      markAutomationJobAttempt("stellium");
      recordAutomationJobStat("stellium", {
        durationMs: Date.now() - startedAt,
        detail: "Ignoré : boîte mail non connectée",
      });
      return;
    }
    const result = await scanStelliumExceltisEmails();
    markAutomationJobRun("stellium");
    recordAutomationJobStat("stellium", {
      durationMs: Date.now() - startedAt,
      detail: `${result.scanned} mail(s) listé(s), ${result.new_signals} nouveau(x) signal(aux)`,
    });
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
    markAutomationJobAttempt("stellium");
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
  const endActivity = beginBackgroundActivity("box-placement-scan");
  const startedAt = Date.now();
  try {
    if (!(await isMailProviderReady())) {
      markAutomationJobAttempt("box_placement");
      recordAutomationJobStat("box_placement", {
        durationMs: Date.now() - startedAt,
        detail: "Ignoré : boîte mail non connectée",
      });
      return;
    }
    const boxResult = await scanBoxPlacementEmails();
    markAutomationJobRun("box_placement");
    recordAutomationJobStat("box_placement", {
      durationMs: Date.now() - startedAt,
      detail: `${boxResult.scanned} mail(s), ${boxResult.created + boxResult.updated} opération(s)`,
    });
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
    markAutomationJobAttempt("box_placement");
    const msg = error instanceof Error ? error.message : String(error);
    if (!isBenignMailSetupError(msg)) {
      console.warn("Box Placement scan:", msg);
      notifyAutomationError(
        "box-placement-scan",
        "CRM W.Y.S — Box Placement",
        msg,
        { tray, nav: { page: "suivi", tab: "alertes" } }
      );
    }
  } finally {
    endActivity();
  }
}

async function runBirthdaysJob(surface: AutomationSurface): Promise<void> {
  if (birthdayNotificationsAlreadySentToday()) return;

  const windowHidden = await isCrmWindowHidden();
  if (!isTray(surface) && !windowHidden) {
    // Fenêtre ouverte : backoff foreground uniquement ; le tray reste immédiatement éligible.
    markAutomationJobAttempt("birthdays");
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
  if (!(await claimBackgroundAutomationLease())) return;

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
  if (shouldRunJob("birthdays", prefs, options)) {
    await runBirthdaysJob(options.surface);
  }
  if (shouldRunJob("tray_digest", prefs, options)) {
    await runTrayDigestJob(options.surface, pipeRdvRemindersSent > 0);
  }
}

/** Sync tray immédiate après déverrouillage (autostart minimisé). */
export async function runBackgroundAutomationAfterUnlock(): Promise<void> {
  if (!(await isCrmWindowHidden())) return;
  await runBackgroundAutomationCycle({ surface: "tray" });
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
    enqueuePendingCycle(options);
    return cycleInFlight;
  }
  cycleInFlight = runBackgroundAutomationCycleInner(options)
    .catch((error) => {
      console.warn("Cycle d'automatisation interrompu:", error);
    })
    .finally(() => {
      cycleInFlight = null;
      drainPendingCycle();
    });
  return cycleInFlight;
}
