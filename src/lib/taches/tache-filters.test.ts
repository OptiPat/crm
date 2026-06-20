import { describe, expect, it } from "vitest";
import {
  countTachesByEcheanceStat,
  filterTachesList,
  groupTachesBySection,
  matchesTacheEcheanceStatFilter,
} from "@/lib/taches/tache-filters";
import type { Tache } from "@/lib/api/tauri-taches";
import { dateInputToUnix } from "@/lib/dates/calendar-date";

const NOW = Date.parse("2026-06-05T10:00:00Z");
const ts = (d: string) => dateInputToUnix(d)!;

function tache(partial: Partial<Tache> & Pick<Tache, "id" | "titre">): Tache {
  return {
    description: null,
    date_echeance: null,
    priorite: "NORMALE",
    statut: "A_FAIRE",
    completed_at: null,
    created_at: 0,
    updated_at: 0,
    contacts: [],
    from_etiquette_auto: false,
    ...partial,
  };
}

describe("matchesTacheEcheanceStatFilter", () => {
  it("filtre par bucket échéance", () => {
    const overdue = tache({ id: 1, titre: "a", date_echeance: ts("2026-06-04") });
    const today = tache({ id: 2, titre: "b", date_echeance: ts("2026-06-05") });
    const week = tache({ id: 3, titre: "c", date_echeance: ts("2026-06-08") });
    const none = tache({ id: 4, titre: "d" });

    expect(matchesTacheEcheanceStatFilter(overdue, "overdue", NOW)).toBe(true);
    expect(matchesTacheEcheanceStatFilter(today, "today", NOW)).toBe(true);
    expect(matchesTacheEcheanceStatFilter(week, "week", NOW)).toBe(true);
    expect(matchesTacheEcheanceStatFilter(none, "none", NOW)).toBe(true);
  });

  it("filtre urgent = retard + aujourd'hui", () => {
    const overdue = tache({ id: 1, titre: "a", date_echeance: ts("2026-06-04") });
    const today = tache({ id: 2, titre: "b", date_echeance: ts("2026-06-05") });
    const week = tache({ id: 3, titre: "c", date_echeance: ts("2026-06-08") });

    expect(matchesTacheEcheanceStatFilter(overdue, "urgent", NOW)).toBe(true);
    expect(matchesTacheEcheanceStatFilter(today, "urgent", NOW)).toBe(true);
    expect(matchesTacheEcheanceStatFilter(week, "urgent", NOW)).toBe(false);
  });
});

describe("countTachesByEcheanceStat", () => {
  it("compte les actives par bucket", () => {
    const taches = [
      tache({ id: 1, titre: "a", date_echeance: ts("2026-06-04") }),
      tache({ id: 2, titre: "b", date_echeance: ts("2026-06-05") }),
      tache({ id: 3, titre: "c", statut: "FAIT" }),
    ];
    const counts = countTachesByEcheanceStat(taches, NOW);
    expect(counts.overdue).toBe(1);
    expect(counts.today).toBe(1);
  });
});

describe("groupTachesBySection", () => {
  it("regroupe retard / aujourd'hui / sans date", () => {
    const taches = [
      tache({ id: 1, titre: "retard", date_echeance: ts("2026-06-04") }),
      tache({ id: 2, titre: "today", date_echeance: ts("2026-06-05") }),
      tache({ id: 3, titre: "sans" }),
    ];
    const sections = groupTachesBySection(taches, NOW);
    expect(sections.map((s) => s.id)).toEqual(["overdue", "today", "none"]);
  });
});

describe("filterTachesList", () => {
  it("filtre recherche et priorité", () => {
    const taches = [
      tache({ id: 1, titre: "Appeler Marie", priorite: "HAUTE" }),
      tache({ id: 2, titre: "Autre", priorite: "NORMALE" }),
    ];
    const out = filterTachesList({
      taches,
      statutFilter: "ACTIVES",
      echeanceFilter: null,
      searchQuery: "marie",
      prioriteFilter: "HAUTE",
      contactIdFilter: null,
      nowMs: NOW,
    });
    expect(out.map((t) => t.id)).toEqual([1]);
  });
});
