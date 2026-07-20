import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  expandAllStatistiquesPanels,
  collapseAllStatistiquesPanels,
  loadStatistiquesSectionOpen,
  saveStatistiquesSectionOpen,
  ALL_STATISTIQUES_PANEL_IDS,
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

  it("migre l'ancienne section attrition vers clients", () => {
    storage.set("crm_statistiques_sections_v1", JSON.stringify({ attrition: false }));
    expect(loadStatistiquesSectionOpen("clients", true)).toBe(false);
    expect(loadStatistiquesSectionOpen("attrition" as "clients", true)).toBe(true);
  });

  it("replie et rouvre tous les panneaux", () => {
    collapseAllStatistiquesPanels();
    for (const panelId of ALL_STATISTIQUES_PANEL_IDS) {
      expect(loadStatistiquesSectionOpen(panelId, true)).toBe(false);
    }
    expandAllStatistiquesPanels();
    for (const panelId of ALL_STATISTIQUES_PANEL_IDS) {
      expect(loadStatistiquesSectionOpen(panelId, false)).toBe(true);
    }
  });
});
