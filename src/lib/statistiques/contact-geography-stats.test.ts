import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  departementCodeFromCodePostal,
  geographyGroupKeyFromContact,
  geographyGroupLabel,
  GEOGRAPHY_FOREIGN_KEY,
  GEOGRAPHY_UNSET_KEY,
} from "@/lib/contacts/departement-from-code-postal";
import {
  computeContactGeographyStats,
  filterContactsByGeographyKey,
  isContactEligibleForClientGeographyStats,
  isContactEligibleForFilleulGeographyStats,
} from "./contact-geography-stats";

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

describe("departement-from-code-postal", () => {
  it("extrait le département métropolitain", () => {
    expect(departementCodeFromCodePostal("34000")).toBe("34");
    expect(geographyGroupLabel("34")).toBe("Hérault (34)");
    expect(departementCodeFromCodePostal("75001")).toBe("75");
  });

  it("gère la Corse et les DOM", () => {
    expect(departementCodeFromCodePostal("20000")).toBe("2A");
    expect(departementCodeFromCodePostal("20250")).toBe("2B");
    expect(departementCodeFromCodePostal("97110")).toBe("971");
  });

  it("classe hors France et non renseigné", () => {
    expect(
      geographyGroupKeyFromContact({ code_postal: "34000", pays: "Suisse" })
    ).toBe(GEOGRAPHY_FOREIGN_KEY);
    expect(geographyGroupKeyFromContact({ code_postal: "", pays: "France" })).toBe(
      GEOGRAPHY_UNSET_KEY
    );
  });
});

describe("contact-geography-stats", () => {
  const contacts = [
    contact({ id: 1, categorie: "CLIENT", code_postal: "34000", pays: "France" }),
    contact({ id: 2, categorie: "CLIENT", code_postal: "75001", pays: "France" }),
    contact({ id: 3, categorie: "CLIENT", statut_suivi: "EN_PAUSE", code_postal: "34000" }),
    contact({ id: 4, categorie: "PROSPECT_CLIENT", code_postal: "34000" }),
    contact({ id: 5, categorie: "SUSPECT_CLIENT", code_postal: "34000" }),
    contact({
      id: 6,
      categorie: "AUCUN",
      filleul_categorie: "FILLEUL",
      parrain_id: 99,
      code_postal: "34000",
    }),
    contact({
      id: 7,
      categorie: "AUCUN",
      filleul_categorie: "FILLEUL",
      parrain_id: 12,
      code_postal: "75001",
    }),
    contact({
      id: 8,
      categorie: "AUCUN",
      filleul_categorie: "FILLEUL_DESINSCRIT",
      code_postal: "34000",
    }),
    contact({
      id: 9,
      categorie: "AUCUN",
      filleul_categorie: "PROSPECT_FILLEUL",
      code_postal: "34000",
    }),
    contact({
      id: 10,
      categorie: "AUCUN",
      filleul_categorie: "SUSPECT_FILLEUL",
      code_postal: "34000",
    }),
  ];

  it("regroupe clients actifs, anciens et prospects dans la lentille client", () => {
    const stats = computeContactGeographyStats(contacts, "client");
    expect(stats.total).toBe(4);
    expect(stats.rows.find((row) => row.key === "34")?.count).toBe(3);
    expect(stats.rows.find((row) => row.key === "75")?.count).toBe(1);
    expect(isContactEligibleForClientGeographyStats({ categorie: "SUSPECT_CLIENT" })).toBe(false);
    expect(isContactEligibleForClientGeographyStats({ categorie: "PROSPECT_CLIENT" })).toBe(true);
  });

  it("regroupe inscrits, prospects et désinscrits dans la lentille filleul", () => {
    const stats = computeContactGeographyStats(contacts, "filleul");
    expect(stats.total).toBe(4);
    expect(stats.rows.find((row) => row.key === "34")?.count).toBe(3);
    expect(isContactEligibleForFilleulGeographyStats({ categorie: "AUCUN", filleul_categorie: "SUSPECT_FILLEUL" })).toBe(
      false
    );
  });

  it("filtre le drill-down par département", () => {
    const filtered = filterContactsByGeographyKey(contacts, "client", "34");
    expect(filtered.map((c) => c.id)).toEqual([1, 3, 4]);
  });
});
