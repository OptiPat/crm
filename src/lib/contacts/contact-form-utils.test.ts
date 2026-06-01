import { describe, expect, it } from "vitest";
import {
  defaultProchainSuiviClient,
  defaultProchainSuiviForClientStatut,
  defaultProchainSuiviSixMois,
  getEmptyForm,
  isAlerteSuiviFilleul,
  resolveImportContactCategories,
  suiviDatesOverrides,
} from "./contact-form-utils";

describe("defaultProchainSuiviClient", () => {
  it("propose J+1 an", () => {
    const ref = new Date(2026, 5, 1);
    expect(defaultProchainSuiviClient(ref)).toBe("2027-06-01");
  });
});

describe("getEmptyForm", () => {
  it("préremplit le prochain suivi suspect client à J+6 mois", () => {
    const form = getEmptyForm("clients");
    expect(form.date_prochain_suivi).toBe(defaultProchainSuiviSixMois());
  });

  it("préremplit le prochain suivi filleul à J+6 mois", () => {
    const form = getEmptyForm("filleuls");
    expect(form.date_prochain_suivi_filleul).toBe(defaultProchainSuiviSixMois());
  });
});

describe("defaultProchainSuiviForClientStatut", () => {
  it("1 an pour client, 6 mois pour prospect/suspect", () => {
    const ref = new Date(2026, 5, 1);
    expect(defaultProchainSuiviForClientStatut("CLIENT", ref)).toBe("2027-06-01");
    expect(defaultProchainSuiviForClientStatut("PROSPECT_CLIENT", ref)).toBe("2026-12-01");
    expect(defaultProchainSuiviForClientStatut("SUSPECT_CLIENT", ref)).toBe("2026-12-01");
  });
});

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
