import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  loadTachesPagePreferences,
  saveTachesPagePreferences,
} from "@/lib/taches/taches-page-preferences";

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

describe("taches-page-preferences", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", mockSessionStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("roundtrip sessionStorage", () => {
    saveTachesPagePreferences({
      statutFilter: "FAITES",
      echeanceFilter: "overdue",
      searchQuery: "test",
      prioriteFilter: "HAUTE",
      contactIdFilter: 5,
    });
    const loaded = loadTachesPagePreferences();
    expect(loaded.statutFilter).toBe("FAITES");
    expect(loaded.echeanceFilter).toBe("overdue");
    expect(loaded.searchQuery).toBe("test");
    expect(loaded.prioriteFilter).toBe("HAUTE");
    expect(loaded.contactIdFilter).toBe(5);
  });
});
