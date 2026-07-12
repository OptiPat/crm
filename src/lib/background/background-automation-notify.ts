import {
  isPermissionGranted,
  registerActionTypes,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import { toast } from "sonner";
import {
  AUTOMATION_NOTIFICATION_ACTION_TYPE,
  type AutomationNotificationTarget,
  serializeAutomationNotificationTarget,
} from "@/lib/background/automation-notification-nav";

const ERROR_NOTIFY_COOLDOWN_MS = 60 * 60_000;
const PERMISSION_TOAST_COOLDOWN_MS = 60 * 60_000;
const lastErrorNotifiedAt = new Map<string, number>();
let lastPermissionToastAt = 0;

let actionsRegistered = false;

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

/** Enregistre le type d'action « Ouvrir » pour le clic sur les notifications bureau. */
export async function registerAutomationNotificationActions(): Promise<void> {
  if (actionsRegistered) return;
  actionsRegistered = true;
  try {
    await registerActionTypes([
      {
        id: AUTOMATION_NOTIFICATION_ACTION_TYPE,
        actions: [
          {
            id: "open",
            title: "Ouvrir",
            foreground: true,
          },
        ],
      },
    ]);
  } catch (error) {
    actionsRegistered = false;
    console.warn("Enregistrement actions notification:", error);
  }
}

export type AutomationNotifyOptions = {
  tray: boolean;
  nav?: AutomationNotificationTarget;
};

export async function notifyAutomationEvent(
  title: string,
  body: string,
  options: AutomationNotifyOptions
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
  await registerAutomationNotificationActions();

  const nav = options.nav ?? { page: "dashboard" as const };
  await sendNotification({
    title,
    body,
    actionTypeId: AUTOMATION_NOTIFICATION_ACTION_TYPE,
    autoCancel: true,
    extra: {
      nav: serializeAutomationNotificationTarget(nav),
    },
  });
  return true;
}

export function notifyAutomationError(
  key: string,
  title: string,
  body: string,
  options: AutomationNotifyOptions
): void {
  const now = Date.now();
  const last = lastErrorNotifiedAt.get(key) ?? 0;
  if (now - last < ERROR_NOTIFY_COOLDOWN_MS) return;
  lastErrorNotifiedAt.set(key, now);
  void notifyAutomationEvent(title, body, {
    ...options,
    nav: options.nav ?? { page: "dashboard" },
  });
}

export function resetAutomationNotifyStateForTests(): void {
  lastErrorNotifiedAt.clear();
  permissionChecked = false;
  permissionGranted = false;
  lastPermissionToastAt = 0;
  actionsRegistered = false;
}
