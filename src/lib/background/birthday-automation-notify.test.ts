import { describe, expect, it, beforeEach, vi } from "vitest";
import type { BirthdayContactToday } from "@/lib/api/tauri-birthday-telegram";
import {
  birthdayNotificationsAlreadySentToday,
  formatBirthdayNotification,
  markBirthdayNotificationsSentToday,
  resetBirthdayNotificationStateForTests,
} from "@/lib/background/birthday-automation-notify";

describe("formatBirthdayNotification", () => {
  it("formate un anniversaire unique", () => {
    const msg = formatBirthdayNotification([
      {
        id: 1,
        prenom: "Jean",
        nom: "DUPONT",
        displayName: "Jean DUPONT",
        categorie: "client",
        registre: "FR",
        birthDate: "1985-03-15",
        age: 41,
      } as BirthdayContactToday,
    ]);
    expect(msg?.body).toContain("Anniversaire de Jean DUPONT");
    expect(msg?.body).toContain("41 ans");
  });

  it("regroupe plusieurs anniversaires", () => {
    const msg = formatBirthdayNotification([
      { displayName: "Jean DUPONT" } as BirthdayContactToday,
      { displayName: "Marie LEGRAND" } as BirthdayContactToday,
    ]);
    expect(msg?.body).toContain("Jean DUPONT");
    expect(msg?.body).toContain("Marie LEGRAND");
  });
});

describe("birthday notification dedupe", () => {
  beforeEach(() => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => {
        store.set(key, value);
      },
      removeItem: (key: string) => {
        store.delete(key);
      },
    });
    resetBirthdayNotificationStateForTests();
  });

  it("une seule passe par jour", () => {
    expect(birthdayNotificationsAlreadySentToday()).toBe(false);
    markBirthdayNotificationsSentToday();
    expect(birthdayNotificationsAlreadySentToday()).toBe(true);
  });
});
