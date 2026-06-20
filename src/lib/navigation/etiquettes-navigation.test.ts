import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  consumeEtiquetteEditFocus,
  navigateToEtiquetteEdit,
  setEtiquetteEditFocus,
} from "./etiquettes-navigation";

function mockSessionStorage() {
  const store = new Map<string, string>();
  return {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => {
      store.set(key, value);
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    clear: () => {
      store.clear();
    },
  };
}

describe("etiquettes-navigation", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", mockSessionStorage());
    vi.stubGlobal("window", {
      dispatchEvent: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("consomme l'intention d'édition une seule fois", () => {
    setEtiquetteEditFocus(42);
    expect(consumeEtiquetteEditFocus()).toBe(42);
    expect(consumeEtiquetteEditFocus()).toBeNull();
  });

  it("navigue vers la page étiquettes", () => {
    const pages: string[] = [];
    navigateToEtiquetteEdit((page) => pages.push(page), 7, "templates-email");
    expect(pages).toEqual(["etiquettes"]);
    expect(consumeEtiquetteEditFocus()).toBe(7);
  });
});
