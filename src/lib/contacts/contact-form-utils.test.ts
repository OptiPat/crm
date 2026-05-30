import { describe, expect, it } from "vitest";
import {
  isAlerteSuiviFilleul,
  resolveImportContactCategories,
  suiviDatesOverrides,
} from "./contact-form-utils";

describe("resolveImportContactCategories", () => {
  it("client si produit", () => {
    expect(resolveImportContactCategories(true, false, false)).toEqual({
      categorie: "CLIENT",
      filleul_categorie: undefined,
    });
  });

  it("filleul prospect si contact sans produit", () => {
    expect(resolveImportContactCategories(false, true, true)).toEqual({
      categorie: "AUCUN",
      filleul_categorie: "PROSPECT_FILLEUL",
    });
  });
});

describe("suiviDatesOverrides", () => {
  const dates = {
    dernierContact: "2025-01-15",
    prochainSuivi: "2025-07-15",
  };

  it("dates client pour alerte client", () => {
    expect(suiviDatesOverrides("SUIVI_CLIENT_1AN", dates)).toEqual({
      date_dernier_contact: "2025-01-15",
      date_prochain_suivi: "2025-07-15",
    });
  });

  it("dates filleul pour alerte filleul", () => {
    expect(suiviDatesOverrides("SUIVI_FILLEUL_1AN", dates)).toEqual({
      date_dernier_contact_filleul: "2025-01-15",
      date_prochain_suivi_filleul: "2025-07-15",
    });
  });
});

describe("isAlerteSuiviFilleul", () => {
  it("détecte les types filleul", () => {
    expect(isAlerteSuiviFilleul("FILLEUL_SUIVI_6MOIS")).toBe(true);
    expect(isAlerteSuiviFilleul("SUIVI_CLIENT_1AN")).toBe(false);
  });
});
