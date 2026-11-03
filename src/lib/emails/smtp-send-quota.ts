import { getSmtpSendQuota, type SmtpSendQuota } from "@/lib/api/tauri-email-oauth";

/** Vérification au plus toutes les 30 s pendant une pause (quota partagé entre lots). */
const MAX_PAUSE_STEP_MS = 30_000;
/** Refus d'un envoi pour quota (même texte que `QUOTA_ERROR_MARK` côté Rust). */
const QUOTA_ERROR_MARK = "Limite d'envoi atteinte";
/** Nouveaux essais d'un même email refusé pour quota (autre envoi passé entre-temps). */
const MAX_QUOTA_RETRIES = 3;

export const SMTP_PAUSE_INTERRUPTED_MESSAGE =
  "Envoi interrompu pendant la pause (CRM verrouillé ou fermé) — relancez l'envoi pour continuer : les emails déjà partis ne seront pas renvoyés.";

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = setTimeout(done, ms);
    function done() {
      clearTimeout(timer);
      signal?.removeEventListener("abort", done);
      resolve();
    }
    signal?.addEventListener("abort", done, { once: true });
  });
}

export function isSmtpQuotaError(error: unknown): boolean {
  const msg = error instanceof Error ? error.message : String(error);
  return msg.includes(QUOTA_ERROR_MARK);
}

type WaitInput = {
  signal?: AbortSignal;
  onPause?: (resumeAtMs: number | null) => void;
  /** Injection pour les tests. */
  getQuota?: () => Promise<SmtpSendQuota>;
  now?: () => number;
};

/**
 * Envoi groupé via une boîte SMTP : attend que le quota horaire (moins la marge laissée aux
 * envois unitaires) autorise l'envoi suivant. `onPause(ms)` reçoit l'heure de reprise
 * estimée, puis `null` à la reprise.
 *
 * - `"ok"` : envoyer (Google / Microsoft, quota libre, ou quota illisible hors pause).
 * - `"interrupted"` : quota devenu illisible pendant une pause (session verrouillée) : arrêter
 *   le lot plutôt que d'enchaîner des échecs ; l'envoi se relance après déverrouillage.
 */
export async function waitForSmtpSendSlot(input: WaitInput): Promise<"ok" | "interrupted"> {
  const getQuota = input.getQuota ?? getSmtpSendQuota;
  const now = input.now ?? Date.now;
  let paused = false;
  let result: "ok" | "interrupted" = "ok";
  while (!input.signal?.aborted) {
    const quota = await getQuota().catch(() => null);
    if (!quota) {
      if (paused) result = "interrupted";
      break;
    }
    if (!quota.applies || quota.batch_wait_seconds <= 0) break;
    const waitMs = quota.batch_wait_seconds * 1000;
    paused = true;
    input.onPause?.(now() + waitMs);
    await abortableSleep(Math.min(waitMs, MAX_PAUSE_STEP_MS), input.signal);
  }
  if (paused) input.onPause?.(null);
  return result;
}

/**
 * Envoi d'un email d'un lot : refusé pour quota (un envoi unitaire a pris la place entre la
 * vérification et l'envoi), on attend la reprise et on réessaie le même email.
 */
export async function sendWithSmtpQuotaRetry<T>(
  send: () => Promise<T>,
  wait: WaitInput
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send();
    } catch (e) {
      if (attempt >= MAX_QUOTA_RETRIES || wait.signal?.aborted || !isSmtpQuotaError(e)) throw e;
      if ((await waitForSmtpSendSlot(wait)) === "interrupted" || wait.signal?.aborted) throw e;
    }
  }
}

/** « Pause : limite d'envoi de l'hébergeur — reprise vers 15 h 40 ». */
export function smtpPauseLabel(resumeAtMs: number): string {
  const d = new Date(resumeAtMs);
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `Pause : limite d'envoi de l'hébergeur — reprise vers ${hh} h ${mm} (CRM ouvert et déverrouillé)`;
}
