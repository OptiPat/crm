import { useEffect, useRef } from "react";

type WakeIntervalRefreshOptions = {
  enabled?: boolean;
  intervalMs: number;
};

/**
 * Tâche périodique en arrière-plan (sync Gmail, scan Stellium…) :
 * intervalle + retour fenêtre, sans événements métier UI.
 */
export function useWakeIntervalRefresh(
  onRefresh: () => void | Promise<void>,
  options: WakeIntervalRefreshOptions
): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const enabled = options.enabled ?? true;
  const { intervalMs } = options;

  useEffect(() => {
    if (!enabled) return;

    const run = () => {
      void onRefreshRef.current();
    };

    const onWake = () => {
      if (!document.hidden) run();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    const intervalId = window.setInterval(() => {
      if (!document.hidden) run();
    }, intervalMs);

    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.clearInterval(intervalId);
    };
  }, [enabled, intervalMs]);
}
