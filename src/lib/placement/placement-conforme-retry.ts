import { toast } from "sonner";
import {
  getPlacementOperation,
  notifyPlacementOperationsChanged,
} from "@/lib/api/tauri-box-placement";

export const PLACEMENT_CONFORME_RETRY_DELAY_MS = 60_000;
export const PLACEMENT_CONFORME_MAX_AUTO_RETRIES = 3;

const pendingTimers = new Map<number, ReturnType<typeof setTimeout>>();
const scheduledAttempts = new Map<number, number>();

/** Quota / rate-limit Gmail ou Graph — un nouvel essai une minute plus tard a du sens. */
export function isPlacementConformeTransientSendError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("ratelimitexceeded") ||
    lower.includes("rate_limit_exceeded") ||
    lower.includes("rate limit") ||
    lower.includes("quota exceeded") ||
    lower.includes("usagelimits") ||
    lower.includes("too many requests") ||
    lower.includes("429") ||
    (lower.includes("403") &&
      (lower.includes("quota") || lower.includes("rate") || lower.includes("limit")))
  );
}

export function placementConformeSendErrorUserMessage(raw: string): string {
  if (isPlacementConformeTransientSendError(raw)) {
    return "Gmail saturé (quota minute) — nouvel essai automatique dans 1 min.";
  }
  return raw;
}

export function resetPlacementConformeRetryStateForTests(): void {
  clearPlacementConformeRetryTimersForTests();
  scheduledAttempts.clear();
}

/** Annule le timer sans remettre le compteur — pour tester le plafond. */
export function clearPlacementConformeRetryTimersForTests(): void {
  for (const handle of pendingTimers.values()) {
    clearTimeout(handle);
  }
  pendingTimers.clear();
}

export function schedulePlacementConformeRetryAfterError(
  operationId: number,
  errorMessage: string
): boolean {
  if (operationId <= 0) return false;
  if (!isPlacementConformeTransientSendError(errorMessage)) return false;
  if (pendingTimers.has(operationId)) return false;
  const attempt = scheduledAttempts.get(operationId) ?? 0;
  if (attempt >= PLACEMENT_CONFORME_MAX_AUTO_RETRIES) return false;
  scheduledAttempts.set(operationId, attempt + 1);
  const handle = setTimeout(() => {
    pendingTimers.delete(operationId);
    void runPlacementConformeRetry(operationId);
  }, PLACEMENT_CONFORME_RETRY_DELAY_MS);
  pendingTimers.set(operationId, handle);
  return true;
}

async function runPlacementConformeRetry(operationId: number): Promise<void> {
  const { maybeSendPlacementConformeEmailForOperation } = await import(
    "@/lib/placement/placement-conforme-email"
  );
  let operation;
  try {
    operation = await getPlacementOperation(operationId);
  } catch {
    return;
  }
  const { outcome, errorMessage } = await maybeSendPlacementConformeEmailForOperation(
    operation,
    { quiet: true }
  );
  if (outcome === "sent") {
    scheduledAttempts.delete(operationId);
    notifyPlacementOperationsChanged();
    toast.success("Email client Box Placement envoyé");
    return;
  }
  if (outcome === "skipped") {
    scheduledAttempts.delete(operationId);
    return;
  }
  const raw = errorMessage ?? "";
  if (schedulePlacementConformeRetryAfterError(operationId, raw)) return;
  if (isPlacementConformeTransientSendError(raw)) {
    toast.warning(
      "Email Box Placement toujours en échec — renvoyez depuis Suivi → Alertes."
    );
  }
}
