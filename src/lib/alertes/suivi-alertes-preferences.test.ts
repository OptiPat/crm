import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  loadSuiviAlertesPreferences,
  saveSuiviAlertesPreferences,
} from "@/lib/alertes/suivi-alertes-preferences";

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

describe("suivi-alertes-preferences", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", mockSessionStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("valeurs par défaut", () => {
    const prefs = loadSuiviAlertesPreferences();
    expect(prefs.categoryFilter).toBe("all");
    expect(prefs.urgencyFilter).toBeNull();
    expect(prefs.sortMode).toBe("days_desc");
    expect(prefs.viewMode).toBe("detailed");
  });

  it("persiste et sanitize", () => {
    saveSuiviAlertesPreferences({
      categoryFilter: "client",
      urgencyFilter: "plus30",
      searchQuery: "dupont",
      sortMode: "name",
      viewMode: "compact",
    });
    const loaded = loadSuiviAlertesPreferences();
    expect(loaded.categoryFilter).toBe("client");
    expect(loaded.urgencyFilter).toBe("plus30");
    expect(loaded.searchQuery).toBe("dupont");
    expect(loaded.viewMode).toBe("compact");
  });

  it("ignore valeurs invalides", () => {
    sessionStorage.setItem(
      "crm_suivi_alertes_v1",
      JSON.stringify({ sortMode: "invalid", urgencyFilter: "bad" })
    );
    const loaded = loadSuiviAlertesPreferences();
    expect(loaded.sortMode).toBe("days_desc");
    expect(loaded.urgencyFilter).toBeNull();
  });
});
