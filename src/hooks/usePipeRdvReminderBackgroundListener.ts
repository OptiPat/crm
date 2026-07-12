import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/core";
import { processDuePipeRdvReminders } from "@/lib/pipe/pipe-rdv-reminder-processor";

/** Écoute le timer Rust (tray) pour envoyer les rappels RDV Pipe même fenêtre cachée. */
export function usePipeRdvReminderBackgroundListener(enabled = true): void {
  useEffect(() => {
    if (!enabled) return;

    let unlisten: (() => void) | undefined;
    let cancelled = false;

    void listen("pipe-rdv-reminder-tick", () => {
      if (!document.hidden) return;
      void (async () => {
        try {
          const unlocked = await invoke<boolean>("is_database_unlocked");
          if (!unlocked) return;
          await processDuePipeRdvReminders(10);
        } catch (e) {
          console.warn("Rappel RDV Pipe (arrière-plan):", e);
        }
      })();
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
