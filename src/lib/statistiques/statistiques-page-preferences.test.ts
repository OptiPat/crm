import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  loadStatistiquesSectionOpen,
  saveStatistiquesSectionOpen,
} from "./statistiques-page-preferences";

describe("statistiques-page-preferences", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
      clear: () => {
        storage.clear();
      },
    });
  });

  it("retourne defaultOpen si aucune valeur enregistrée", () => {
    expect(loadStatistiquesSectionOpen("source_client", true)).toBe(true);
    expect(loadStatistiquesSectionOpen("source_client", false)).toBe(false);
  });

  it("persiste l'état ouvert/fermé", () => {
    saveStatistiquesSectionOpen("conversion_filleul", false);
    expect(loadStatistiquesSectionOpen("conversion_filleul", true)).toBe(false);

    saveStatistiquesSectionOpen("contacts", true);
    expect(loadStatistiquesSectionOpen("contacts", false)).toBe(true);
  });
});
