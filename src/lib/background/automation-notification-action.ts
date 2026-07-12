import { invoke } from "@tauri-apps/api/core";
import {
  applyAutomationNotificationTarget,
  parseAutomationNotificationTarget,
  serializeAutomationNotificationTarget,
} from "@/lib/background/automation-notification-nav";
import {
  clearPendingAutomationNavLocal,
  persistPendingAutomationNav,
} from "@/lib/background/automation-notification-pending";

export type AutomationNotificationActionOptions = {
  /** false = mettre la nav en file jusqu'au déverrouillage */
  authenticated?: boolean;
  /** true = le focus a déjà été fait côté Rust (toast WinRT) */
  skipFocus?: boolean;
};

/** Cible navigation depuis le payload `extra` d'une notification bureau. */
export function handleAutomationNotificationAction(
  extra: Record<string, unknown> | undefined,
  setCurrentPage: (page: string) => void,
  options: AutomationNotificationActionOptions = {}
): void {
  const authenticated = options.authenticated ?? true;

  if (!options.skipFocus) {
    void invoke("focus_main_window_cmd").catch((error) => {
      console.warn("Focus fenêtre après notification:", error);
    });
  }

  const target = parseAutomationNotificationTarget(extra);
  const navJson = serializeAutomationNotificationTarget(target);

  if (!authenticated) {
    persistPendingAutomationNav(navJson);
    return;
  }

  clearPendingAutomationNavLocal();
  applyAutomationNotificationTarget(target, setCurrentPage);
}
