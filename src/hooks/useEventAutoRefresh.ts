import { useEffect, useRef } from "react";

const DEBOUNCE_MS = 120;

type EventSubscribe = (handler: () => void) => () => void;

export type EventAutoRefreshOptions = {
  /** Rafraîchir au retour fenêtre (défaut : true). */
  wake?: boolean;
};

function parseSubscriptionsAndOptions(
  subscriptionsAndOptions: (EventSubscribe | EventAutoRefreshOptions)[]
): { subscriptions: EventSubscribe[]; options: EventAutoRefreshOptions } {
  const last = subscriptionsAndOptions[subscriptionsAndOptions.length - 1];
  if (last != null && typeof last !== "function") {
    return {
      subscriptions: subscriptionsAndOptions.slice(0, -1) as EventSubscribe[],
      options: last,
    };
  }
  return {
    subscriptions: subscriptionsAndOptions as EventSubscribe[],
    options: {},
  };
}

/** Rafraîchissement événementiel + retour fenêtre, sans polling. */
export function useEventAutoRefresh(
  onRefresh: () => void | Promise<void>,
  ...subscriptionsAndOptions: (EventSubscribe | EventAutoRefreshOptions)[]
): void {
  const { subscriptions, options } = parseSubscriptionsAndOptions(subscriptionsAndOptions);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const debounceRef = useRef<number | null>(null);
  const subscriptionsRef = useRef(subscriptions);
  subscriptionsRef.current = subscriptions;
  const wakeEnabled = options.wake !== false;

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

    if (wakeEnabled) {
      document.addEventListener("visibilitychange", onWake);
      window.addEventListener("focus", onWake);
    }

    return () => {
      for (const unsub of unsubs) unsub();
      if (wakeEnabled) {
        document.removeEventListener("visibilitychange", onWake);
        window.removeEventListener("focus", onWake);
      }
      if (debounceRef.current != null) window.clearTimeout(debounceRef.current);
    };
  }, [wakeEnabled]);
}
