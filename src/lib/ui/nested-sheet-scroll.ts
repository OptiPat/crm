import { useEffect, type WheelEvent } from "react";

/** Empêche la molette de faire défiler `<main>` derrière un sheet empilé (fiche → investissement). */
export function useLockAppMainScroll(active: boolean) {
  useEffect(() => {
    if (!active) return;
    const main = document.querySelector("main");
    if (!main) return;
    const prev = main.style.overflow;
    main.style.overflow = "hidden";
    return () => {
      main.style.overflow = prev;
    };
  }, [active]);
}

export function stopWheelPropagation(event: WheelEvent<HTMLElement>) {
  event.stopPropagation();
}
