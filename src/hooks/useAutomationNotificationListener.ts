import { useEffect, useRef } from "react";
import { listen } from "@tauri-apps/api/event";
import { onAction } from "@tauri-apps/plugin-notification";
import { handleAutomationNotificationAction } from "@/lib/background/automation-notification-action";
import { consumePendingAutomationNotificationNav } from "@/lib/background/automation-notification-pending";
import { AUTOMATION_NOTIFICATION_ACTIVATED_EVENT } from "@/lib/background/automation-notification-events";
import { registerAutomationNotificationActions } from "@/lib/background/background-automation-notify";

type NotificationActionListener = {
  unregister: () => Promise<void>;
};

/**
 * Écoute les clics notification (WinRT + fallback plugin).
 * Actif même avant déverrouillage : nav mise en file jusqu'à auth.
 */
export function useAutomationNotificationListener(
  isAuthenticated: boolean,
  setCurrentPage: (page: string) => void
): void {
  const isAuthenticatedRef = useRef(isAuthenticated);
  isAuthenticatedRef.current = isAuthenticated;

  useEffect(() => {
    let unlistenAction: NotificationActionListener | undefined;
    let unlistenActivated: (() => void) | undefined;
    let cancelled = false;

    void listen<{ nav?: string }>(AUTOMATION_NOTIFICATION_ACTIVATED_EVENT, (event) => {
      handleAutomationNotificationAction(
        event.payload?.nav != null ? { nav: event.payload.nav } : undefined,
        setCurrentPage,
        { authenticated: isAuthenticatedRef.current, skipFocus: true }
      );
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenActivated = fn;
    });

    void (async () => {
      await registerAutomationNotificationActions();
      const actionListener = await onAction((notification) => {
        handleAutomationNotificationAction(
          notification.extra as Record<string, unknown> | undefined,
          setCurrentPage,
          { authenticated: isAuthenticatedRef.current }
        );
      });
      if (cancelled) {
        await actionListener.unregister();
      } else {
        unlistenAction = actionListener as NotificationActionListener;
      }
    })();

    return () => {
      cancelled = true;
      void unlistenAction?.unregister();
      unlistenActivated?.();
    };
  }, [setCurrentPage]);

  useEffect(() => {
    if (!isAuthenticated) return;
    void consumePendingAutomationNotificationNav(setCurrentPage);
  }, [isAuthenticated, setCurrentPage]);
}
