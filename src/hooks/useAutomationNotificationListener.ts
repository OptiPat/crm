import { useEffect } from "react";
import { onAction } from "@tauri-apps/plugin-notification";
import { handleAutomationNotificationAction } from "@/lib/background/automation-notification-action";
import { registerAutomationNotificationActions } from "@/lib/background/background-automation-notify";

type NotificationActionListener = {
  unregister: () => Promise<void>;
};

/** Clic sur « Ouvrir » (ou activation toast Windows) → focus fenêtre + navigation cible. */
export function useAutomationNotificationListener(
  enabled: boolean,
  setCurrentPage: (page: string) => void
): void {
  useEffect(() => {
    if (!enabled) return;

    let unlisten: NotificationActionListener | undefined;
    let cancelled = false;

    void (async () => {
      await registerAutomationNotificationActions();
      const listener = await onAction((notification) => {
        handleAutomationNotificationAction(
          notification.extra as Record<string, unknown> | undefined,
          setCurrentPage
        );
      });
      if (cancelled) {
        await listener.unregister();
      } else {
        unlisten = listener as NotificationActionListener;
      }
    })();

    return () => {
      cancelled = true;
      void unlisten?.unregister();
    };
  }, [enabled, setCurrentPage]);
}
