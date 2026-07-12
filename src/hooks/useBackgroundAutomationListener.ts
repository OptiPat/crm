import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { runBackgroundAutomationCycle } from "@/lib/background/background-automation-runner";

const BACKGROUND_AUTOMATION_TICK = "background-automation-tick";

/** Écoute le timer Rust (tray) pour les automatisations CRM fenêtre cachée. */
export function useBackgroundAutomationListener(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen(BACKGROUND_AUTOMATION_TICK, () => {
      if (!document.hidden) return;
      void runBackgroundAutomationCycle({ surface: "tray" });
    }).then((fn) => {
      if (cancelled) fn();
      else unlisten = fn;
    });

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, [enabled]);
}
