import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { toast } from "sonner";

const ERROR_NOTIFY_COOLDOWN_MS = 60 * 60_000;
const PERMISSION_TOAST_COOLDOWN_MS = 60 * 60_000;
const lastErrorNotifiedAt = new Map<string, number>();
let lastPermissionToastAt = 0;

function notifyNotificationPermissionDenied(): void {
  const now = Date.now();
  if (now - lastPermissionToastAt < PERMISSION_TOAST_COOLDOWN_MS) return;
  lastPermissionToastAt = now;
  toast.warning(
    "Notifications bureau désactivées. Autorisez CRM W.Y.S dans Réglages système → Notifications pour les alertes en arrière-plan."
  );
}

let permissionChecked = false;
let permissionGranted = false;

async function ensureNotificationPermission(): Promise<boolean> {
  if (permissionChecked) return permissionGranted;
  permissionChecked = true;
  if (await isPermissionGranted()) {
    permissionGranted = true;
    return true;
  }
  const status = await requestPermission();
  permissionGranted = status === "granted";
  return permissionGranted;
}

export async function notifyAutomationEvent(
  title: string,
  body: string,
  options: { tray: boolean }
): Promise<boolean> {
  if (!options.tray) {
    if (typeof document !== "undefined" && document.hidden) {
      return false;
    }
    toast.info(body ? `${title} — ${body}` : title);
    return true;
  }
  const ok = await ensureNotificationPermission();
  if (!ok) {
    notifyNotificationPermissionDenied();
    return false;
  }
  await sendNotification({ title, body });
  return true;
}

export function notifyAutomationError(
  key: string,
  title: string,
  body: string,
  options: { tray: boolean }
): void {
  const now = Date.now();
  const last = lastErrorNotifiedAt.get(key) ?? 0;
  if (now - last < ERROR_NOTIFY_COOLDOWN_MS) return;
  lastErrorNotifiedAt.set(key, now);
  void notifyAutomationEvent(title, body, options);
}

export function resetAutomationNotifyStateForTests(): void {
  lastErrorNotifiedAt.clear();
  permissionChecked = false;
  permissionGranted = false;
  lastPermissionToastAt = 0;
}
