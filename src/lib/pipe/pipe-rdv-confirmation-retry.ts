import { toast } from "sonner";
import { isTransientEmailSendError } from "@/lib/emails/transient-send-error";
import type { PipeRdvConfirmationSendOptions } from "@/lib/pipe/pipe-rdv-confirmation-email";

export const PIPE_RDV_CONFIRMATION_RETRY_DELAY_MS = 60_000;
export const PIPE_RDV_CONFIRMATION_MAX_AUTO_RETRIES = 3;

export type PipeRdvConfirmationFailure = {
  contactId: number;
  message: string;
};

type RetryPayload = PipeRdvConfirmationSendOptions;

export function pipeRdvConfirmationRetryContactIds(
  failures: PipeRdvConfirmationFailure[]
): number[] {
  return failures
    .filter((f) => f.contactId > 0 && isTransientEmailSendError(f.message))
    .map((f) => f.contactId);
}

export function firstTransientConfirmationError(
  failures: PipeRdvConfirmationFailure[]
): string | undefined {
  return failures.find((f) => isTransientEmailSendError(f.message))?.message;
}

const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const scheduledAttempts = new Map<number, number>();
const pendingPayloads = new Map<number, RetryPayload>();

export function resetPipeRdvConfirmationRetryStateForTests(): void {
  clearPipeRdvConfirmationRetryTimersForTests();
  scheduledAttempts.clear();
  pendingPayloads.clear();
}

export function clearPipeRdvConfirmationRetryTimersForTests(): void {
  for (const handle of pendingTimers.values()) {
    clearTimeout(handle);
  }
  pendingTimers.clear();
}

/** Succès (envoi ou replanif) : ne pas renvoyer le mail 1 min plus tard. */
export function cancelPipeRdvConfirmationRetry(entryId: number): boolean {
  if (entryId <= 0) return false;
  const handle = pendingTimers.get(entryId);
  if (handle) clearTimeout(handle);
  pendingTimers.delete(entryId);
  pendingPayloads.delete(entryId);
  scheduledAttempts.delete(entryId);
  return handle != null;
}

export function hasPipeRdvConfirmationRetryPending(entryId: number): boolean {
  return pendingTimers.has(entryId);
}

export function peekPipeRdvConfirmationRetryContactIdsForTests(
  entryId: number
): number[] | undefined {
  return pendingPayloads.get(entryId)?.onlyContactIds;
}

export function schedulePipeRdvConfirmationRetryAfterError(
  options: RetryPayload,
  errorMessage: string
): boolean {
  const entryId = options.pipeTimelineEntryId;
  if (entryId <= 0) return false;
  if (!isTransientEmailSendError(errorMessage)) return false;
  if (pendingTimers.has(entryId)) {
    pendingPayloads.set(entryId, options);
    return true;
  }
  const attempt = scheduledAttempts.get(entryId) ?? 0;
  if (attempt >= PIPE_RDV_CONFIRMATION_MAX_AUTO_RETRIES) return false;
  scheduledAttempts.set(entryId, attempt + 1);
  pendingPayloads.set(entryId, options);
  const handle = setTimeout(() => {
    pendingTimers.delete(entryId);
    void runPipeRdvConfirmationRetry(entryId);
  }, PIPE_RDV_CONFIRMATION_RETRY_DELAY_MS);
  pendingTimers.set(entryId, handle);
  return true;
}

async function runPipeRdvConfirmationRetry(entryId: number): Promise<void> {
  const payload = pendingPayloads.get(entryId);
  pendingPayloads.delete(entryId);
  if (!payload) return;
  const { maybeSendPipeRdvConfirmationEmail } = await import(
    "@/lib/pipe/pipe-rdv-confirmation-email"
  );
  const { sent, errors } = await maybeSendPipeRdvConfirmationEmail({
    ...payload,
    quiet: true,
  });
  if (hasPipeRdvConfirmationRetryPending(entryId)) return;
  if (sent > 0) {
    toast.success(
      sent === 1
        ? "Email de confirmation RDV envoyé"
        : `${sent} emails de confirmation RDV envoyés`
    );
    return;
  }
  if (errors.some((msg) => isTransientEmailSendError(msg))) {
    toast.warning(
      "Confirmation RDV toujours en échec — renvoyez depuis la fiche Pipe."
    );
  }
}
