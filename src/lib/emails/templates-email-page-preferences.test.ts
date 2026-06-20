import { describe, expect, it, beforeEach, afterEach, vi } from "vitest";
import {
  loadTemplatesEmailPagePreferences,
  saveTemplatesEmailPagePreferences,
} from "./templates-email-page-preferences";

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

describe("templates-email-page-preferences", () => {
  beforeEach(() => {
    vi.stubGlobal("sessionStorage", mockSessionStorage());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("persiste recherche, intention et mode", () => {
    saveTemplatesEmailPagePreferences({
      searchQuery: " IR ",
      categoryFilter: "FISCALITE",
      activationFilter: "trigger",
    });
    expect(loadTemplatesEmailPagePreferences()).toEqual({
      searchQuery: " IR ",
      categoryFilter: "FISCALITE",
      activationFilter: "trigger",
    });
  });

  it("ignore les valeurs invalides", () => {
    sessionStorage.setItem(
      "crm_templates_email_page_v1",
      JSON.stringify({
        searchQuery: 42,
        categoryFilter: "INVALID",
        activationFilter: "nope",
      })
    );
    expect(loadTemplatesEmailPagePreferences()).toEqual({
      searchQuery: "",
      categoryFilter: "all",
      activationFilter: null,
    });
  });
});
