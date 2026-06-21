import { describe, expect, it } from "vitest";
import {
  alerteSectionId,
  countAlertesByUrgency,
  filterAlertes,
  groupAlertesBySection,
  matchesAlerteSearch,
  matchesAlerteUrgencyFilter,
  sortAlertes,
} from "@/lib/alertes/alerte-filters";
import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";

const NOW_SEC = Math.floor(Date.parse("2026-06-05T10:00:00Z") / 1000);
const DAY = 86400;

function alerte(
  partial: Partial<AlerteWithContact> & Pick<AlerteWithContact, "alerte_id">
): AlerteWithContact {
  return {
    contact_id: 1,
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    contact_categorie: "CLIENT",
    date_dernier_contact: null,
    type_alerte: "SUIVI_CLIENT_1AN",
    message: "Jean DUPONT - suivi client",
    date_alerte: String(NOW_SEC),
    ...partial,
  };
}

describe("matchesAlerteUrgencyFilter", () => {
  it("classe par ancienneté", () => {
    const old = alerte({
      alerte_id: 1,
      date_alerte: String(NOW_SEC - 35 * DAY),
    });
    const mid = alerte({
      alerte_id: 2,
      date_alerte: String(NOW_SEC - 10 * DAY),
    });
    const recent = alerte({
      alerte_id: 3,
      date_alerte: String(NOW_SEC - 2 * DAY),
    });

    expect(matchesAlerteUrgencyFilter(old, "plus30", NOW_SEC)).toBe(true);
    expect(matchesAlerteUrgencyFilter(mid, "plus7", NOW_SEC)).toBe(true);
    expect(matchesAlerteUrgencyFilter(recent, "recent", NOW_SEC)).toBe(true);
  });
});

describe("countAlertesByUrgency", () => {
  it("compte les buckets", () => {
    const list = [
      alerte({ alerte_id: 1, date_alerte: String(NOW_SEC - 40 * DAY) }),
      alerte({ alerte_id: 2, date_alerte: String(NOW_SEC - 10 * DAY) }),
      alerte({ alerte_id: 3, date_alerte: String(NOW_SEC - 1 * DAY) }),
    ];
    const counts = countAlertesByUrgency(list, NOW_SEC);
    expect(counts.plus30).toBe(1);
    expect(counts.plus7).toBe(1);
    expect(counts.recent).toBe(1);
  });
});

describe("filterAlertes", () => {
  it("filtre recherche insensible aux accents", () => {
    const list = [
      alerte({ alerte_id: 1, contact_nom: "ÉTIENNE", contact_prenom: "Luc" }),
      alerte({ alerte_id: 2, contact_nom: "BERNARD", contact_prenom: "Paul" }),
    ];
    const filtered = filterAlertes(list, {
      categoryFilter: "all",
      urgencyFilter: null,
      searchQuery: "etienne",
      nowSec: NOW_SEC,
    });
    expect(filtered).toHaveLength(1);
    expect(filtered[0].alerte_id).toBe(1);
  });
});

describe("groupAlertesBySection", () => {
  it("regroupe par priorité", () => {
    const list = [
      alerte({ alerte_id: 1, date_alerte: String(NOW_SEC - 40 * DAY) }),
      alerte({ alerte_id: 2, date_alerte: String(NOW_SEC - 1 * DAY) }),
    ];
    const sections = groupAlertesBySection(list, NOW_SEC);
    expect(sections[0].id).toBe("priority");
    expect(sections[1].id).toBe("recent");
  });
});

describe("sortAlertes", () => {
  it("tri par nom", () => {
    const list = [
      alerte({ alerte_id: 1, contact_nom: "ZORRO", contact_prenom: "A" }),
      alerte({ alerte_id: 2, contact_nom: "ALPHA", contact_prenom: "B" }),
    ];
    const sorted = sortAlertes(list, "name", NOW_SEC);
    expect(sorted[0].alerte_id).toBe(2);
  });
});

describe("matchesAlerteSearch", () => {
  it("match sur prénom", () => {
    const a = alerte({ alerte_id: 1, contact_prenom: "Marie" });
    expect(matchesAlerteSearch(a, "marie")).toBe(true);
  });
});

describe("alerteSectionId", () => {
  it("prioritaire à +30 j", () => {
    const a = alerte({ alerte_id: 1, date_alerte: String(NOW_SEC - 31 * DAY) });
    expect(alerteSectionId(a, NOW_SEC)).toBe("priority");
  });
});
