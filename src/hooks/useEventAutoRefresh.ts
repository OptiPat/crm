import { useEffect, useRef } from "react";

const DEBOUNCE_MS = 120;

type EventSubscribe = (handler: () => void) => () => void;

/** Rafraîchissement événementiel + retour fenêtre, sans polling. */
export function useEventAutoRefresh(
  onRefresh: () => void | Promise<void>,
  ...subscriptions: EventSubscribe[]
): void {
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const debounceRef = useRef<number | null>(null);
  const subscriptionsRef = useRef(subscriptions);
  subscriptionsRef.current = subscriptions;

  useEffect(() => {
    const schedule = () => {
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
      debounceRef.current = window.setTimeout(() => {
        debounceRef.current = null;
        void onRefreshRef.current();
      }, DEBOUNCE_MS);
    };

    const unsubs = subscriptionsRef.current.map((sub) => sub(schedule));

    const onWake = () => {
      if (!document.hidden) void onRefreshRef.current();
    };
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);

    return () => {
      for (const unsub of unsubs) unsub();
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, []);
}
