import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  contactMatchesClientSubTab,
  countContactCategories,
  isAncienClient,
  normalizeClientSubTab,
} from "./contacts-category-match";

function contact(
  partial: Pick<Contact, "categorie"> &
    Partial<Pick<Contact, "statut_suivi" | "filleul_categorie">>
): Contact {
  return {
    id: 1,
    nom: "DUPONT",
    prenom: "Jean",
    statut_suivi: "ACTIF",
    ...partial,
  } as Contact;
}

describe("isAncienClient", () => {
  it("identifie un client EN_PAUSE", () => {
    expect(isAncienClient({ categorie: "CLIENT", statut_suivi: "EN_PAUSE" })).toBe(true);
  });

  it("ignore les prospects et clients actifs", () => {
    expect(isAncienClient({ categorie: "CLIENT", statut_suivi: "ACTIF" })).toBe(false);
    expect(
      isAncienClient({ categorie: "PROSPECT_CLIENT", statut_suivi: "EN_PAUSE" })
    ).toBe(false);
  });
});

describe("contactMatchesClientSubTab", () => {
  it("sépare clients actifs et anciens clients", () => {
    const actif = contact({ categorie: "CLIENT", statut_suivi: "ACTIF" });
    const ancien = contact({ categorie: "CLIENT", statut_suivi: "EN_PAUSE" });

    expect(contactMatchesClientSubTab(actif, "CLIENT")).toBe(true);
    expect(contactMatchesClientSubTab(ancien, "CLIENT")).toBe(false);
    expect(contactMatchesClientSubTab(ancien, "CLIENT_ANCIEN")).toBe(true);
    expect(contactMatchesClientSubTab(actif, "CLIENT_ANCIEN")).toBe(false);
  });

  it("conserve les prospects et suspects", () => {
    const prospect = contact({ categorie: "PROSPECT_CLIENT", statut_suivi: "ACTIF" });
    const suspect = contact({ categorie: "SUSPECT_CLIENT", statut_suivi: "ACTIF" });

    expect(contactMatchesClientSubTab(prospect, "PROSPECT_CLIENT")).toBe(true);
    expect(contactMatchesClientSubTab(suspect, "SUSPECT_CLIENT")).toBe(true);
  });
});

describe("countContactCategories", () => {
  it("compte clients actifs et anciens clients séparément", () => {
    const counts = countContactCategories([
      contact({ categorie: "CLIENT", statut_suivi: "ACTIF" }),
      contact({ categorie: "CLIENT", statut_suivi: "EN_PAUSE" }),
      contact({ categorie: "CLIENT", statut_suivi: "ARCHIVE" }),
      contact({ categorie: "PROSPECT_CLIENT", statut_suivi: "ACTIF" }),
      contact({
        categorie: "AUCUN",
        statut_suivi: "ACTIF",
        filleul_categorie: "FILLEUL_DESINSCRIT",
      }),
    ]);

    expect(counts.CLIENT).toBe(2);
    expect(counts.CLIENT_ANCIEN).toBe(1);
    expect(counts.PROSPECT_CLIENT).toBe(1);
    expect(counts.FILLEUL_DESINSCRIT).toBe(1);
  });
});

describe("normalizeClientSubTab", () => {
  it("migre l'ancienne clé CLIENT_DESINVESTI", () => {
    expect(normalizeClientSubTab("CLIENT_DESINVESTI")).toBe("CLIENT_ANCIEN");
    expect(normalizeClientSubTab("CLIENT")).toBe("CLIENT");
  });
});
