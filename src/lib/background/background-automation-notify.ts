import { invoke } from "@tauri-apps/api/core";
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
import { persistPendingAutomationNav } from "@/lib/background/automation-notification-pending";
import { AUTOMATION_NOTIFICATION_ACTIVATED_EVENT } from "@/lib/background/automation-notification-events";

export { AUTOMATION_NOTIFICATION_ACTIVATED_EVENT };

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

function isWindowsDesktop(): boolean {
  if (typeof navigator === "undefined") return false;
  return navigator.userAgent.includes("Windows");
}

/** Enregistre le type d'action « Ouvrir » (fallback macOS / Linux). */
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

async function sendTrayDesktopNotification(
  title: string,
  body: string,
  nav: AutomationNotificationTarget
): Promise<boolean> {
  const navJson = serializeAutomationNotificationTarget(nav);
  persistPendingAutomationNav(navJson);

  if (isWindowsDesktop()) {
    try {
      await invoke("send_automation_desktop_toast_cmd", {
        title,
        body,
        navJson,
      });
      return true;
    } catch (error) {
      console.warn("Toast WinRT indisponible, repli plugin notification:", error);
    }
  }

  const ok = await ensureNotificationPermission();
  if (!ok) {
    notifyNotificationPermissionDenied();
    return false;
  }

  await registerAutomationNotificationActions();
  await sendNotification({
    title,
    body,
    actionTypeId: AUTOMATION_NOTIFICATION_ACTION_TYPE,
    autoCancel: true,
    extra: {
      nav: navJson,
    },
  });
  return true;
}

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

  const nav = options.nav ?? { page: "dashboard" as const };
  return sendTrayDesktopNotification(title, body, nav);
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
