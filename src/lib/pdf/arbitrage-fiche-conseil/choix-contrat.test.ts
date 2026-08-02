import { describe, expect, it } from "vitest";
import { resolveArbitrageAvChoixContrat } from "@/lib/pdf/arbitrage-fiche-conseil/choix-contrat";

describe("resolveArbitrageAvChoixContrat", () => {
  it("mappe Suravenir vers Cristalliance Avenir", () => {
    const result = resolveArbitrageAvChoixContrat({
      nomProduit: "Vie Plus",
      partenaireNom: "Suravenir",
      numeroContrat: "AV-12345",
    });
    expect(result.value).toBe("Cristalliance Avenir");
  });

  it("mappe Apicil + Vie First vers Cristalliance Vie First", () => {
    const result = resolveArbitrageAvChoixContrat({
      nomProduit: "Vie First",
      partenaireNom: "Apicil",
    });
    expect(result.value).toBe("Cristalliance Vie First");
  });

  it("mappe Cristalliance Evoluvie via Apicil", () => {
    const result = resolveArbitrageAvChoixContrat({
      nomProduit: "Contrat retraite",
      partenaireNom: "Apicil",
    });
    expect(result.value).toBe("Cristalliance Evoluvie");
  });

  it("retourne null si ambigu ou inconnu", () => {
    const result = resolveArbitrageAvChoixContrat({
      nomProduit: "Produit inconnu",
      partenaireNom: "Assureur X",
    });
    expect(result.value).toBeNull();
    expect(result.candidates).toEqual([]);
  });
});
