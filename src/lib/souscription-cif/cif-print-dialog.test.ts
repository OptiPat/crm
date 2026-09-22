import { describe, expect, it } from "vitest";
import {
  MAC_PRINT_OPEN_GRACE_MS,
  MAC_PRINT_WATCHDOG_MS,
  PRINT_DIALOG_SAFETY_MS,
  initialPrintDialogState,
  isMacPrintPlatform,
  reducePrintDialog,
  waitForCifPrintDialogClose,
  type CifPrintDialogWindow,
  type PrintDialogEvent,
  type PrintDialogState,
} from "@/lib/souscription-cif/cif-print-dialog";

function applyAll(events: PrintDialogEvent[], start: PrintDialogState = initialPrintDialogState()) {
  return events.reduce(reducePrintDialog, start);
}

describe("isMacPrintPlatform", () => {
  it("reconnaît WKWebView macOS et ignore Chrome Windows", () => {
    expect(
      isMacPrintPlatform({
        platform: "MacIntel",
        userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15",
        vendor: "Apple Computer, Inc.",
      })
    ).toBe(true);
    expect(
      isMacPrintPlatform({
        platform: "Win32",
        userAgent:
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0",
        vendor: "Google Inc.",
      })
    ).toBe(false);
  });
});

describe("reducePrintDialog", () => {
  it("sur Windows bloquant, le média print décide", () => {
    const saved = applyAll([
      { type: "media-print" },
      { type: "print-returned", elapsedMs: 400, mac: false },
    ]);
    expect(saved.completed).toBe(true);

    const cancelled = applyAll([
      { type: "print-returned", elapsedMs: 400, mac: false },
    ]);
    expect(cancelled.completed).toBe(false);
  });

  it("sur Windows, un retour immédiat attend le filet de 5 s", () => {
    const cancelled = applyAll([
      { type: "print-returned", elapsedMs: 20, mac: false },
      { type: "safety-timeout" },
    ]);
    expect(cancelled.phase).toBe("done");
    expect(cancelled.completed).toBe(false);

    const saved = applyAll([
      { type: "print-returned", elapsedMs: 20, mac: false },
      { type: "media-print" },
      { type: "safety-afterprint" },
    ]);
    expect(saved.completed).toBe(true);
  });

  it("sur macOS, un afterprint différé enchaîne même sans média print", () => {
    const state = applyAll([
      { type: "print-returned", elapsedMs: 8, mac: true },
      { type: "mac-afterprint", elapsedSinceReturnMs: 2_000 },
    ]);
    expect(state.completed).toBe(true);
  });

  it("ignore l'afterprint d'ouverture et le filet de 5 s qui coupait l'export", () => {
    const state = applyAll([
      { type: "afterprint" },
      { type: "print-returned", elapsedMs: 6, mac: true },
      { type: "mac-afterprint", elapsedSinceReturnMs: 50 },
      { type: "safety-timeout" },
    ]);
    expect(state.phase).toBe("waiting-mac");
    expect(state.completed).toBeNull();
  });

  it("un afterprint avant la grâce ne démonte pas le document", () => {
    const state = applyAll([
      { type: "afterprint" },
      { type: "print-returned", elapsedMs: 6, mac: true },
      { type: "mac-afterprint", elapsedSinceReturnMs: MAC_PRINT_OPEN_GRACE_MS - 1 },
    ]);
    expect(state.phase).toBe("waiting-mac");
    expect(state.completed).toBeNull();
  });

  it("un print macOS lent ne considère pas la boîte comme déjà fermée", () => {
    const state = applyAll([{ type: "print-returned", elapsedMs: 250, mac: true }]);
    expect(state.phase).toBe("waiting-mac");
    expect(state.completed).toBeNull();
  });

  it("le premier afterprint trop tôt reste une ouverture, le suivant ferme", () => {
    const opened = applyAll([
      { type: "print-returned", elapsedMs: 8, mac: true },
      { type: "mac-afterprint", elapsedSinceReturnMs: MAC_PRINT_OPEN_GRACE_MS - 1 },
    ]);
    expect(opened.completed).toBeNull();

    const closed = reducePrintDialog(opened, {
      type: "mac-afterprint",
      elapsedSinceReturnMs: MAC_PRINT_OPEN_GRACE_MS,
    });
    expect(closed.completed).toBe(true);
  });
});

type Timer = { id: number; at: number; fn: () => void };

function createFakeWindow(mac: boolean, print: (host: FakeHost) => void): FakeHost {
  const host: FakeHost = {
    mac,
    clock: 0,
    mediaMatches: false,
    listeners: new Map(),
    mediaListeners: new Set(),
    timers: [],
    nextTimerId: 1,
    printImpl: print,
    navigator: {
      userAgent: mac
        ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15"
        : "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      platform: mac ? "MacIntel" : "Win32",
      vendor: mac ? "Apple Computer, Inc." : "Google Inc.",
    },
    matchMedia: () => ({
      get matches() {
        return host.mediaMatches;
      },
      addEventListener: (_type, listener) => {
        host.mediaListeners.add(listener);
      },
      removeEventListener: (_type, listener) => {
        host.mediaListeners.delete(listener);
      },
    }),
    addEventListener: (type, listener) => {
      const set = host.listeners.get(type) ?? new Set();
      set.add(listener);
      host.listeners.set(type, set);
    },
    removeEventListener: (type, listener) => {
      host.listeners.get(type)?.delete(listener);
    },
    setTimeout: (fn, timeout) => {
      const id = host.nextTimerId++;
      host.timers.push({ id, at: host.clock + timeout, fn });
      return id;
    },
    clearTimeout: (id) => {
      host.timers = host.timers.filter((timer) => timer.id !== id);
    },
    print: () => host.printImpl(host),
    emit(type: string) {
      for (const listener of [...(host.listeners.get(type) ?? [])]) listener();
    },
    emitMedia() {
      for (const listener of [...host.mediaListeners]) listener();
    },
    flushUntil(at: number) {
      host.clock = at;
      const due = host.timers.filter((timer) => timer.at <= host.clock);
      host.timers = host.timers.filter((timer) => timer.at > host.clock);
      for (const timer of due) timer.fn();
    },
  };
  return host;
}

type FakeHost = CifPrintDialogWindow & {
  mac: boolean;
  clock: number;
  mediaMatches: boolean;
  listeners: Map<string, Set<() => void>>;
  mediaListeners: Set<() => void>;
  timers: Timer[];
  nextTimerId: number;
  printImpl: (host: FakeHost) => void;
  emit: (type: string) => void;
  emitMedia: () => void;
  flushUntil: (at: number) => void;
};

describe("waitForCifPrintDialogClose", () => {
  it("enchaîne sur macOS quand le panneau se ferme, sans média print", async () => {
    const host = createFakeWindow(true, () => {
      host.clock += 8;
    });
    let completed: boolean | undefined;
    const pending = waitForCifPrintDialogClose(host, () => host.clock).then((value) => {
      completed = value;
    });

    await Promise.resolve();
    expect(completed).toBeUndefined();

    host.flushUntil(PRINT_DIALOG_SAFETY_MS);
    await Promise.resolve();
    expect(completed).toBeUndefined();

    host.clock = 2_000;
    host.emit("afterprint");
    await pending;
    expect(completed).toBe(true);
  });

  it("n'interrompt pas si afterprint part à l'ouverture du panneau macOS", async () => {
    const host = createFakeWindow(true, () => {
      host.emit("afterprint");
      host.clock += 5;
    });
    let completed: boolean | undefined;
    const pending = waitForCifPrintDialogClose(host, () => host.clock).then((value) => {
      completed = value;
    });

    await Promise.resolve();
    host.flushUntil(PRINT_DIALOG_SAFETY_MS);
    await Promise.resolve();
    expect(completed).toBeUndefined();

    host.clock += MAC_PRINT_OPEN_GRACE_MS;
    host.emit("afterprint");
    await pending;
    expect(completed).toBe(true);
  });

  it("un print macOS de plus de 100 ms laisse le panneau ouvert", async () => {
    const host = createFakeWindow(true, () => {
      host.clock += 150;
    });
    let completed: boolean | undefined;
    const pending = waitForCifPrintDialogClose(host, () => host.clock).then((value) => {
      completed = value;
    });

    await Promise.resolve();
    expect(completed).toBeUndefined();

    host.clock = 2_000;
    host.emit("afterprint");
    await pending;
    expect(completed).toBe(true);
  });

  it("sur Mac, print() part tout de suite, comme sur Windows", async () => {
    let printCount = 0;
    const host = createFakeWindow(true, () => {
      printCount += 1;
      host.clock += 5;
    });
    const pending = waitForCifPrintDialogClose(host, () => host.clock);
    expect(printCount).toBe(1);

    host.clock = 2_000;
    host.emit("afterprint");
    await expect(pending).resolves.toBe(true);
  });

  it("sur Windows, un retour immédiat sans média n'enchaîne pas", async () => {
    const host = createFakeWindow(false, () => {
      host.clock += 20;
    });
    const pending = waitForCifPrintDialogClose(host, () => host.clock);
    host.flushUntil(host.clock + PRINT_DIALOG_SAFETY_MS);
    await expect(pending).resolves.toBe(false);
  });

  it("sur Windows, une annulation n'enchaîne pas", async () => {
    const host = createFakeWindow(false, () => {
      host.clock += 300;
    });
    await expect(waitForCifPrintDialogClose(host, () => host.clock)).resolves.toBe(false);
  });

  it("sur Windows, un enregistrement enchaîne", async () => {
    const host = createFakeWindow(false, () => {
      host.mediaMatches = true;
      host.emitMedia();
      host.clock += 300;
    });
    await expect(waitForCifPrintDialogClose(host, () => host.clock)).resolves.toBe(true);
  });

  it("débloque un export macOS resté sans signal", async () => {
    const host = createFakeWindow(true, () => {
      host.clock += 4;
    });
    const pending = waitForCifPrintDialogClose(host, () => host.clock);
    host.flushUntil(host.clock + MAC_PRINT_WATCHDOG_MS);
    await expect(pending).resolves.toBe(false);
  });
});
