import type {
  TrayDigestPipeRdvItem,
  TrayDigestSnapshot,
} from "@/lib/api/tauri-tray-digest";
import type { AutomationNotificationTarget } from "@/lib/background/automation-notification-nav";
import { resolveTrayDigestNavTarget } from "@/lib/background/automation-notification-nav";
import { formatPipeRdvEmailTime } from "@/lib/pipe/pipe-rdv-email-vars";
import { rdvStageFromEntryTitre } from "@/lib/pipe/pipe-rdv-stage";

const FINGERPRINT_KEY = "crm_tray_digest_fingerprint";
const SENT_AT_KEY = "crm_tray_digest_sent_at";
const RDV_NOTIFIED_KEY = "crm_tray_digest_rdv_notified";

/** Délai minimum entre deux digest identiques (évite le spam). */
export const TRAY_DIGEST_MIN_INTERVAL_MS = 2 * 60 * 60_000;

export type TrayDigestLine = {
  kind: "rdv" | "alertes" | "taches" | "emails";
  text: string;
};

export function formatTrayDigestRdvLine(item: TrayDigestPipeRdvItem, nowUnix: number): string {
  const stage = rdvStageFromEntryTitre(item.timeline_titre);
  const stageLabel = stage ? `RDV ${stage}` : "RDV Pipe";
  const name = item.contact_nom.trim() || item.contact_prenom.trim() || "Contact";
  const time = formatPipeRdvEmailTime(item.start_at);
  const minsLeft = Math.max(0, Math.round((item.start_at - nowUnix) / 60));
  const delay =
    minsLeft <= 5
      ? "maintenant"
      : minsLeft < 60
        ? `dans ${minsLeft} min`
        : `dans ${Math.floor(minsLeft / 60)} h ${minsLeft % 60} min`;
  return `${stageLabel} avec ${name} à ${time} (${delay})`;
}

export function buildTrayDigestLines(
  snapshot: TrayDigestSnapshot,
  nowUnix = Math.floor(Date.now() / 1000)
): TrayDigestLine[] {
  const lines: TrayDigestLine[] = [];

  for (const rdv of snapshot.pipe_rdvs_within_2h.slice(0, 2)) {
    lines.push({
      kind: "rdv",
      text: formatTrayDigestRdvLine(rdv, nowUnix),
    });
  }
  if (snapshot.pipe_rdvs_within_2h.length > 2) {
    lines.push({
      kind: "rdv",
      text: `+${snapshot.pipe_rdvs_within_2h.length - 2} autre(s) RDV Pipe dans les 2 h`,
    });
  }

  if (snapshot.alertes_count > 0) {
    lines.push({
      kind: "alertes",
      text:
        snapshot.alertes_count === 1
          ? "1 alerte Suivi à traiter"
          : `${snapshot.alertes_count} alertes Suivi à traiter`,
    });
  }
  if (snapshot.taches_urgent_count > 0) {
    lines.push({
      kind: "taches",
      text:
        snapshot.taches_urgent_count === 1
          ? "1 tâche aujourd'hui / en retard"
          : `${snapshot.taches_urgent_count} tâches aujourd'hui / en retard`,
    });
  }
  if (snapshot.emails_ready_count > 0) {
    lines.push({
      kind: "emails",
      text:
        snapshot.emails_ready_count === 1
          ? "1 email prêt dans Suivi"
          : `${snapshot.emails_ready_count} emails prêts dans Suivi`,
    });
  }

  return lines;
}

export function trayDigestFingerprint(lines: TrayDigestLine[]): string {
  return lines.map((l) => `${l.kind}:${l.text}`).join("|");
}

function readJsonSet(key: string): Set<number> {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((n): n is number => typeof n === "number"));
  } catch {
    return new Set();
  }
}

function writeJsonSet(key: string, values: Set<number>): void {
  try {
    localStorage.setItem(key, JSON.stringify([...values]));
  } catch {
    /* ignore */
  }
}

export function hasNewImminentRdv(
  snapshot: TrayDigestSnapshot,
  notifiedIds: Set<number>
): boolean {
  return snapshot.pipe_rdvs_within_2h.some((r) => !notifiedIds.has(r.calendar_event_id));
}

export type TrayDigestSendDecision = {
  shouldSend: boolean;
  title: string;
  body: string;
  fingerprint: string;
  navTarget: AutomationNotificationTarget;
  /** IDs RDV à marquer comme notifiés après envoi réussi. */
  rdvIdsToMark: number[];
};

export function decideTrayDigestNotification(
  snapshot: TrayDigestSnapshot,
  options: {
    nowMs?: number;
    lastFingerprint?: string | null;
    lastSentAtMs?: number | null;
    notifiedRdvIds?: Set<number>;
  } = {}
): TrayDigestSendDecision {
  const nowMs = options.nowMs ?? Date.now();
  const nowUnix = Math.floor(nowMs / 1000);
  const lines = buildTrayDigestLines(snapshot, nowUnix);
  const fingerprint = trayDigestFingerprint(lines);
  const navTarget = resolveTrayDigestNavTarget(lines);
  const empty: TrayDigestSendDecision = {
    shouldSend: false,
    title: "",
    body: "",
    fingerprint,
    navTarget,
    rdvIdsToMark: [],
  };
  if (lines.length === 0) return empty;

  const notifiedRdvIds = options.notifiedRdvIds ?? new Set<number>();
  const imminentIds = snapshot.pipe_rdvs_within_2h.map((r) => r.calendar_event_id);
  const newRdv = hasNewImminentRdv(snapshot, notifiedRdvIds);

  const lastSentAtMs = options.lastSentAtMs ?? 0;
  const cooledDown = nowMs - lastSentAtMs >= TRAY_DIGEST_MIN_INTERVAL_MS;

  /** Cooldown 2 h strict, sauf nouveau RDV dans les 2 h. */
  if (!cooledDown && !newRdv) {
    return empty;
  }

  const rdvLines = lines.filter((l) => l.kind === "rdv");
  const restLines = lines.filter((l) => l.kind !== "rdv");

  let title = "CRM W.Y.S — À traiter";
  let body: string;

  if (rdvLines.length === 1 && restLines.length === 0) {
    title = "CRM W.Y.S — RDV imminent";
    body = rdvLines[0]!.text.replace(/\s*\([^)]*\)\s*$/, "");
  } else if (rdvLines.length > 0 && restLines.length === 0) {
    title = "CRM W.Y.S — RDV imminents";
    body = rdvLines.map((l) => l.text).join("\n");
  } else {
    body = lines.map((l) => `• ${l.text}`).join("\n");
  }

  const rdvIdsToMark = newRdv
    ? imminentIds.filter((id) => !notifiedRdvIds.has(id))
    : [];

  return {
    shouldSend: true,
    title,
    body,
    fingerprint,
    navTarget,
    rdvIdsToMark,
  };
}

export function loadTrayDigestNotifyState(): {
  lastFingerprint: string | null;
  lastSentAtMs: number;
  notifiedRdvIds: Set<number>;
} {
  let lastFingerprint: string | null = null;
  let lastSentAtMs = 0;
  try {
    lastFingerprint = localStorage.getItem(FINGERPRINT_KEY);
    const raw = localStorage.getItem(SENT_AT_KEY);
    if (raw) lastSentAtMs = Number(raw) || 0;
  } catch {
    /* ignore */
  }
  const notifiedRdvIds = readJsonSet(RDV_NOTIFIED_KEY);
  return { lastFingerprint, lastSentAtMs, notifiedRdvIds };
}

export function persistTrayDigestNotifyState(
  fingerprint: string,
  sentAtMs: number,
  notifiedRdvIds: Set<number>,
  currentImminentIds: number[]
): void {
  try {
    localStorage.setItem(FINGERPRINT_KEY, fingerprint);
    localStorage.setItem(SENT_AT_KEY, String(sentAtMs));
  } catch {
    /* ignore */
  }
  const pruned = new Set(
    [...notifiedRdvIds, ...currentImminentIds].filter((id) =>
      currentImminentIds.includes(id)
    )
  );
  writeJsonSet(RDV_NOTIFIED_KEY, pruned);
}

export function resetTrayDigestNotifyStateForTests(): void {
  try {
    localStorage.removeItem(FINGERPRINT_KEY);
    localStorage.removeItem(SENT_AT_KEY);
    localStorage.removeItem(RDV_NOTIFIED_KEY);
  } catch {
    /* ignore */
  }
}
