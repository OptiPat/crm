import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ETIQUETTES_CHANGED_EVENT,
  ETIQUETTES_DEBOUNCE_MS,
  mergeRelationChangedDetails,
  notifyEtiquettesChanged,
  subscribeEtiquettesChangedDebounced,
} from "@/lib/etiquettes/etiquette-events";

function mockWindow() {
  const listeners = new Map<string, Set<(event: Event) => void>>();
  vi.stubGlobal("window", {
    addEventListener: (type: string, handler: (event: Event) => void) => {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(handler);
    },
    removeEventListener: (type: string, handler: (event: Event) => void) => {
      listeners.get(type)?.delete(handler);
    },
    dispatchEvent: (event: Event) => {
      listeners.get(event.type)?.forEach((handler) => handler(event));
      return true;
    },
    setTimeout: globalThis.setTimeout.bind(globalThis),
    clearTimeout: globalThis.clearTimeout.bind(globalThis),
  });
}

describe("mergeRelationChangedDetails", () => {
  it("garde le 1er évènement tel quel quand rien n'est en attente", () => {
    const merged = mergeRelationChangedDetails(null, {
      contactId: 1,
      skipQueueReload: true,
      skipEtiquettesChanged: true,
    });
    expect(merged.skipQueueReload).toBe(true);
    expect(merged.skipEtiquettesChanged).toBe(true);
  });

  it("ne saute pas le rechargement dès qu'un évènement le réclame", () => {
    // 1er : envoi individuel déjà patché en local (skip), 2e : a besoin du reload.
    const pending = mergeRelationChangedDetails(null, {
      skipQueueReload: true,
      skipEtiquettesChanged: true,
    });
    const merged = mergeRelationChangedDetails(pending, { contactId: 2 });
    expect(merged.skipQueueReload).toBe(false);
    expect(merged.skipEtiquettesChanged).toBe(false);
  });

  it("conserve skip uniquement si TOUS les évènements le demandent", () => {
    const pending = mergeRelationChangedDetails(null, { skipQueueReload: true });
    const merged = mergeRelationChangedDetails(pending, { skipQueueReload: true });
    expect(merged.skipQueueReload).toBe(true);
  });
});

describe("subscribeEtiquettesChangedDebounced", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("expose la même fenêtre de debounce que relation-changed", () => {
    expect(ETIQUETTES_DEBOUNCE_MS).toBe(300);
    expect(ETIQUETTES_CHANGED_EVENT).toBe("crm:etiquettes-changed");
  });

  it("regroupe les évènements dans la fenêtre de debounce", () => {
    vi.useFakeTimers();
    mockWindow();
    const handler = vi.fn();
    const unsub = subscribeEtiquettesChangedDebounced(handler, 300);

    notifyEtiquettesChanged();
    notifyEtiquettesChanged();
    expect(handler).not.toHaveBeenCalled();

    vi.advanceTimersByTime(300);
    expect(handler).toHaveBeenCalledTimes(1);

    unsub();
  });

  it("annule le handler en attente au désabonnement", () => {
    vi.useFakeTimers();
    mockWindow();
    const handler = vi.fn();
    const unsub = subscribeEtiquettesChangedDebounced(handler, 300);

    notifyEtiquettesChanged();
    unsub();
    vi.advanceTimersByTime(300);
    expect(handler).not.toHaveBeenCalled();
  });
});
