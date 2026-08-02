import { describe, expect, it } from "vitest";
import { resolveStelliumAvProductLabelFromCrm } from "@/lib/pdf/arbitrage-fiche-conseil/av-stellium-product-map";

describe("resolveStelliumAvProductLabelFromCrm", () => {
  it("mappe Suravenir et Vie Plus vers Cristalliance Avenir", () => {
    expect(
      resolveStelliumAvProductLabelFromCrm({
        nomProduit: "Vie Plus",
        partenaireNom: "Suravenir",
      })
    ).toBe("Cristalliance Avenir");
    expect(
      resolveStelliumAvProductLabelFromCrm({ nomProduit: "Suravenir", partenaireNom: null })
    ).toBe("Cristalliance Avenir");
  });

  it("mappe Apicil vers Cristalliance Evoluvie", () => {
    expect(
      resolveStelliumAvProductLabelFromCrm({
        nomProduit: "Contrat retraite",
        partenaireNom: "Apicil",
      })
    ).toBe("Cristalliance Evoluvie");
  });

  it("mappe Apicil Vie First vers Cristalliance Vie First", () => {
    expect(
      resolveStelliumAvProductLabelFromCrm({
        nomProduit: "Vie First",
        partenaireNom: "Apicil",
      })
    ).toBe("Cristalliance Vie First");
  });

  it("mappe Oddo vers Cristalliance Opportunites", () => {
    expect(
      resolveStelliumAvProductLabelFromCrm({
        nomProduit: "Contrat",
        partenaireNom: "Oddo",
      })
    ).toBe("Cristalliance Opportunites");
  });

  it("mappe Oddo Ingénierie vers Fipavie Ingénierie", () => {
    expect(
      resolveStelliumAvProductLabelFromCrm({
        nomProduit: "Oddo Ingénierie",
        partenaireNom: null,
      })
    ).toBe("Fipavie Ingénierie");
  });

  it("accepte un libellé catalogue déjà exact", () => {
    expect(
      resolveStelliumAvProductLabelFromCrm({
        nomProduit: "Cristalliance Avenir",
        partenaireNom: null,
      })
    ).toBe("Cristalliance Avenir");
  });

  it("retourne null si inconnu", () => {
    expect(
      resolveStelliumAvProductLabelFromCrm({
        nomProduit: "Produit X",
        partenaireNom: "Assureur Y",
      })
    ).toBeNull();
  });
});
