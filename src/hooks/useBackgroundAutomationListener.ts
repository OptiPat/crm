import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { runTrayAutomationCycleIfHidden } from "@/lib/background/background-automation-runner";

const BACKGROUND_AUTOMATION_TICK = "background-automation-tick";
/** Aligné sur `MAIN_WINDOW_BACKGROUND_EVENT` (Rust `app_runtime/tray.rs`). */
const MAIN_WINDOW_BACKGROUND_EVENT = "main-window-background";

/** Écoute le timer Rust (tray) pour les automatisations CRM fenêtre cachée. */
export function useBackgroundAutomationListener(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    let unlistenTick: (() => void) | undefined;
    let unlistenBackground: (() => void) | undefined;
    let cancelled = false;

    void listen(BACKGROUND_AUTOMATION_TICK, () => {
      void runTrayAutomationCycleIfHidden();
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenTick = fn;
    });

    void listen(MAIN_WINDOW_BACKGROUND_EVENT, () => {
      void runTrayAutomationCycleIfHidden();
    }).then((fn) => {
      if (cancelled) fn();
      else unlistenBackground = fn;
    });

    const onDocumentHidden = () => {
      if (document.hidden) {
        void runTrayAutomationCycleIfHidden();
      }
    };
    document.addEventListener("visibilitychange", onDocumentHidden);

    return () => {
      cancelled = true;
      unlistenTick?.();
      unlistenBackground?.();
      document.removeEventListener("visibilitychange", onDocumentHidden);
    };
  }, [enabled]);
}
