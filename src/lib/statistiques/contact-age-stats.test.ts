import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  computeContactAgeStats,
  filterContactsForAgeLens,
  formatAverageAgeLabel,
  formatAgeStatsSubtitle,
} from "./contact-age-stats";
import {
  isContactEligibleForClientStatsLens,
  isContactEligibleForFilleulStatsLens,
} from "./contact-stats-lenses";

function contact(partial: Partial<Contact> & Pick<Contact, "id">): Contact {
  return {
    categorie: "CLIENT",
    nom: "DUPONT",
    prenom: "Jean",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

/** 1 janvier 1980 UTC */
const BIRTH_1980 = 315_532_800;
/** 1 juillet 1990 UTC */
const BIRTH_1990 = 647_366_400;

describe("contact-age-stats", () => {
  const ref = new Date("2026-07-20T12:00:00");

  const contacts = [
    contact({ id: 1, categorie: "CLIENT", date_naissance: BIRTH_1980 }),
    contact({ id: 2, categorie: "CLIENT", date_naissance: BIRTH_1990 }),
    contact({ id: 3, categorie: "CLIENT", statut_suivi: "EN_PAUSE", date_naissance: BIRTH_1980 }),
    contact({ id: 4, categorie: "PROSPECT_CLIENT", date_naissance: BIRTH_1990 }),
    contact({ id: 5, categorie: "CLIENT" }),
    contact({ id: 6, categorie: "SUSPECT_CLIENT", date_naissance: BIRTH_1980 }),
    contact({
      id: 7,
      categorie: "AUCUN",
      filleul_categorie: "FILLEUL",
      parrain_id: 99,
      date_naissance: BIRTH_1980,
    }),
    contact({
      id: 8,
      categorie: "AUCUN",
      filleul_categorie: "FILLEUL_DESINSCRIT",
      parrain_id: 12,
      date_naissance: BIRTH_1990,
    }),
    contact({
      id: 9,
      categorie: "AUCUN",
      filleul_categorie: "PROSPECT_FILLEUL",
      date_naissance: BIRTH_1990,
    }),
    contact({ id: 10, categorie: "AUCUN", filleul_categorie: "FILLEUL" }),
    contact({
      id: 11,
      categorie: "AUCUN",
      filleul_categorie: "SUSPECT_FILLEUL",
      date_naissance: BIRTH_1980,
    }),
  ];

  it("calcule l'âge moyen client (actifs, anciens, prospects)", () => {
    const stats = computeContactAgeStats(contacts, "client", ref);
    expect(stats.totalEligible).toBe(5);
    expect(stats.countedCount).toBe(4);
    expect(stats.missingBirthDateCount).toBe(1);
    expect(stats.averageAge).toBeCloseTo((46 + 36 + 46 + 36) / 4, 5);
    expect(isContactEligibleForClientStatsLens({ categorie: "SUSPECT_CLIENT" })).toBe(false);
  });

  it("calcule l'âge moyen filleul tous parrains confondus", () => {
    const stats = computeContactAgeStats(contacts, "filleul", ref);
    expect(stats.totalEligible).toBe(4);
    expect(stats.countedCount).toBe(3);
    expect(isContactEligibleForFilleulStatsLens({ categorie: "AUCUN", filleul_categorie: "SUSPECT_FILLEUL" })).toBe(
      false
    );
  });

  it("formate l'âge moyen et le sous-titre", () => {
    const stats = computeContactAgeStats(contacts, "client", ref);
    expect(formatAverageAgeLabel(stats.averageAge!)).toBe("41 ans");
    expect(formatAgeStatsSubtitle(stats)).toBe("Calculé sur 4 contacts · 1 sans date de naissance");
  });

  it("filtre les contacts avec ou sans date de naissance pour le drill-down", () => {
    expect(filterContactsForAgeLens(contacts, "client", "withBirthDate").map((c) => c.id)).toEqual([
      1, 2, 3, 4,
    ]);
    expect(filterContactsForAgeLens(contacts, "client", "missingBirthDate").map((c) => c.id)).toEqual([
      5,
    ]);
  });
});
