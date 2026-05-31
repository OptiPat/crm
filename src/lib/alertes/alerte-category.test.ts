import { describe, expect, it } from "vitest";
import {
  countAlertesByCategory,
  getAlerteCategory,
  matchesAlerteCategoryFilter,
} from "./alerte-category";

describe("alerte-category", () => {
  it("classifie client / prospect / filleul / patrimoine", () => {
    expect(getAlerteCategory("SUIVI_CLIENT_1AN")).toBe("client");
    expect(getAlerteCategory("LEAD_JAMAIS_CONTACTE")).toBe("prospect");
    expect(getAlerteCategory("FILLEUL_SUIVI_6MOIS")).toBe("filleul");
    expect(getAlerteCategory("FIN_DEMEMBREMENT")).toBe("patrimoine");
  });

  it("filtre par catégorie", () => {
    expect(matchesAlerteCategoryFilter("ANNIVERSAIRE", "patrimoine")).toBe(true);
    expect(matchesAlerteCategoryFilter("ANNIVERSAIRE", "client")).toBe(false);
    expect(matchesAlerteCategoryFilter("X", "all")).toBe(true);
  });

  it("compte par catégorie", () => {
    const counts = countAlertesByCategory([
      { type_alerte: "SUIVI_CLIENT_1AN" },
      { type_alerte: "LEAD_SUIVI_6MOIS" },
      { type_alerte: "FIN_DEMEMBREMENT" },
    ]);
    expect(counts.all).toBe(3);
    expect(counts.client).toBe(1);
    expect(counts.prospect).toBe(1);
    expect(counts.patrimoine).toBe(1);
  });
});
