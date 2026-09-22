/**
 * Fermeture de la boîte d'impression CIF.
 *
 * Windows (WebView2) : `window.print()` bloque jusqu'à la fermeture, et le média
 * `print` distingue un enregistrement d'une annulation.
 * macOS (WKWebView) : `window.print()` rend la main tout de suite, `afterprint`
 * peut partir à l'ouverture du panneau, et `matchMedia("print")` ne passe pas
 * à true. Traiter ça comme une annulation coupait les documents suivants
 * (« Export interrompu »).
 */

/** Au-delà, `window.print()` a bloqué : la boîte est déjà fermée (WebView2). */
export const PRINT_BLOCKING_MS = 100;

/** Filet Windows si `afterprint` ne part pas (retour immédiat, ex. annulation). */
export const PRINT_DIALOG_SAFETY_MS = 5_000;

/**
 * Doublon ignoré : avant ce délai, un `afterprint` est l'ouverture du panneau,
 * pas sa fermeture. Le document reste monté le temps de choisir « Enregistrer au format PDF ».
 */
export const MAC_PRINT_OPEN_GRACE_MS = 700;

/** Débloque l'UI si aucun signal de fermeture n'arrive (macOS). */
export const MAC_PRINT_WATCHDOG_MS = 10 * 60_000;

export function isMacPrintPlatform(nav: {
  userAgent?: string;
  platform?: string;
  vendor?: string;
}): boolean {
  if (/Mac/i.test(nav.platform ?? "")) return true;
  if (/Macintosh|Mac OS X/i.test(nav.userAgent ?? "")) return true;
  return nav.vendor === "Apple Computer, Inc.";
}

export type PrintDialogPhase = "calling" | "waiting-mac" | "waiting-safety" | "done";

export type PrintDialogState = {
  phase: PrintDialogPhase;
  sawPrintMedia: boolean;
  afterPrintDuringCall: boolean;
  /** `afterprint` reçus après le retour de `print()` (macOS). */
  macAfterPrints: number;
  completed: boolean | null;
};

export function initialPrintDialogState(): PrintDialogState {
  return {
    phase: "calling",
    sawPrintMedia: false,
    afterPrintDuringCall: false,
    macAfterPrints: 0,
    completed: null,
  };
}

export type PrintDialogEvent =
  | { type: "media-print" }
  | { type: "afterprint" }
  | { type: "print-returned"; elapsedMs: number; mac: boolean }
  | { type: "mac-afterprint"; elapsedSinceReturnMs: number }
  | { type: "safety-afterprint" }
  | { type: "safety-timeout" }
  | { type: "watchdog" };

export function reducePrintDialog(
  state: PrintDialogState,
  event: PrintDialogEvent
): PrintDialogState {
  if (state.phase === "done") return state;

  if (event.type === "media-print") {
    return { ...state, sawPrintMedia: true };
  }

  if (state.phase === "calling") {
    if (event.type === "afterprint") {
      return { ...state, afterPrintDuringCall: true };
    }
    if (event.type === "print-returned") {
      // Windows : un retour lent veut dire que la boîte modale est déjà fermée.
      // macOS : même un retour > 100 ms peut n'être que l'ouverture du panneau.
      if (!event.mac && event.elapsedMs > PRINT_BLOCKING_MS) {
        return { ...state, phase: "done", completed: state.sawPrintMedia };
      }
      return {
        ...state,
        phase: event.mac ? "waiting-mac" : "waiting-safety",
      };
    }
    return state;
  }

  if (state.phase === "waiting-safety") {
    if (event.type === "safety-afterprint" || event.type === "safety-timeout") {
      return { ...state, phase: "done", completed: state.sawPrintMedia };
    }
    return state;
  }

  if (event.type === "mac-afterprint") {
    const macAfterPrints = state.macAfterPrints + 1;
    const counted = { ...state, macAfterPrints };
    if (event.elapsedSinceReturnMs < MAC_PRINT_OPEN_GRACE_MS) return counted;
    return { ...counted, phase: "done", completed: true };
  }
  if (event.type === "watchdog") {
    return { ...state, phase: "done", completed: false };
  }
  return state;
}

export type CifPrintDialogWindow = {
  navigator: { userAgent?: string; platform?: string; vendor?: string };
  matchMedia: (query: string) => {
    matches: boolean;
    addEventListener: (type: "change", listener: () => void) => void;
    removeEventListener: (type: "change", listener: () => void) => void;
  };
  addEventListener: (type: string, listener: () => void) => void;
  removeEventListener: (type: string, listener: () => void) => void;
  setTimeout: (handler: () => void, timeout: number) => number;
  clearTimeout: (id: number) => void;
  print: () => void;
};

export function waitForCifPrintDialogClose(
  win: CifPrintDialogWindow = window,
  now: () => number = () => performance.now()
): Promise<boolean> {
  const mac = isMacPrintPlatform(win.navigator);

  return new Promise((resolve, reject) => {
    let state = initialPrintDialogState();
    let settled = false;
    let safetyTimer = 0;
    let watchdogTimer = 0;
    let returnedAt = 0;

    const mql = win.matchMedia("print");

    const cleanup = () => {
      win.removeEventListener("afterprint", onAfterDuringCall);
      win.removeEventListener("afterprint", onMacAfterPrint);
      win.removeEventListener("afterprint", onSafetyAfterPrint);
      mql.removeEventListener("change", onMedia);
      win.clearTimeout(safetyTimer);
      win.clearTimeout(watchdogTimer);
    };

    const apply = (event: PrintDialogEvent) => {
      if (settled) return;
      state = reducePrintDialog(state, event);
      if (state.phase !== "done" || state.completed === null) return;
      settled = true;
      cleanup();
      resolve(state.completed);
    };

    const onMedia = () => {
      if (mql.matches) apply({ type: "media-print" });
    };
    const onAfterDuringCall = () => apply({ type: "afterprint" });
    const onMacAfterPrint = () =>
      apply({ type: "mac-afterprint", elapsedSinceReturnMs: now() - returnedAt });
    const onSafetyAfterPrint = () => apply({ type: "safety-afterprint" });

    let printStarted = false;

    const runPrint = () => {
      if (settled || printStarted) return;
      printStarted = true;
      if (mql.matches) apply({ type: "media-print" });
      win.addEventListener("afterprint", onAfterDuringCall);
      mql.addEventListener("change", onMedia);
      safetyTimer = win.setTimeout(() => apply({ type: "safety-timeout" }), PRINT_DIALOG_SAFETY_MS);

      const startedAt = now();
      let elapsedMs = 0;
      try {
        win.print();
        elapsedMs = now() - startedAt;
      } catch (error) {
        settled = true;
        cleanup();
        reject(error instanceof Error ? error : new Error("Impression impossible"));
        return;
      }
      returnedAt = now();

      win.removeEventListener("afterprint", onAfterDuringCall);
      apply({ type: "print-returned", elapsedMs, mac });
      if (settled) return;

      if (state.phase === "waiting-mac") {
        win.clearTimeout(safetyTimer);
        win.addEventListener("afterprint", onMacAfterPrint);
        watchdogTimer = win.setTimeout(() => apply({ type: "watchdog" }), MAC_PRINT_WATCHDOG_MS);
        return;
      }

      win.addEventListener("afterprint", onSafetyAfterPrint);
    };

    runPrint();
  });
}
