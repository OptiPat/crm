import { invoke } from "@tauri-apps/api/core";
import {
  applyAutomationNotificationTarget,
  parseAutomationNotificationTarget,
} from "@/lib/background/automation-notification-nav";

/** Cible navigation depuis le payload `extra` d'une notification bureau. */
export function handleAutomationNotificationAction(
  extra: Record<string, unknown> | undefined,
  setCurrentPage: (page: string) => void
): void {
  void invoke("focus_main_window_cmd").catch((error) => {
    console.warn("Focus fenêtre après notification:", error);
  });
  const target = parseAutomationNotificationTarget(extra);
  applyAutomationNotificationTarget(target, setCurrentPage);
}
