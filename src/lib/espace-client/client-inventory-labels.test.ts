import { describe, expect, it } from "vitest";
import { inventoryRowLabels } from "./client-inventory-labels";

describe("inventoryRowLabels", () => {
  it("affiche le type et le partenaire si le nom n'est que le type", () => {
    expect(
      inventoryRowLabels({
        typeProduit: "ASSURANCE_VIE",
        nomProduit: "Assurance-vie",
        partenaireNom: "Vie Plus",
      })
    ).toEqual({ title: "Assurance Vie", subtitle: "Vie Plus" });
    expect(
      inventoryRowLabels({
        typeProduit: "PER",
        nomProduit: "PER",
        partenaireNom: "Vie Plus",
      })
    ).toEqual({ title: "PER", subtitle: "Vie Plus" });
  });

  it("met le nom commercial en titre, type et partenaire en légende", () => {
    expect(
      inventoryRowLabels({
        typeProduit: "ASSURANCE_VIE",
        nomProduit: "VIE PLUS ALTAREA CORIM",
        partenaireNom: "Vie Plus",
      })
    ).toEqual({
      title: "VIE PLUS ALTAREA CORIM",
      subtitle: "Assurance Vie · Vie Plus",
    });
  });

  it("ne répète pas le partenaire s'il est déjà le titre", () => {
    expect(
      inventoryRowLabels({
        typeProduit: "ASSURANCE_VIE",
        nomProduit: "Vie Plus",
        partenaireNom: "Vie Plus",
      })
    ).toEqual({ title: "Vie Plus", subtitle: "Assurance Vie" });
  });

  it("garde le nom de SCPI en titre", () => {
    expect(
      inventoryRowLabels({
        typeProduit: "SCPI",
        nomProduit: "Transitions Europe",
        partenaireNom: "Arkea",
      })
    ).toEqual({
      title: "Transitions Europe",
      subtitle: "SCPI · Arkea",
    });
  });

  it("n'invente pas de légende sans partenaire ni nom distinct", () => {
    expect(
      inventoryRowLabels({
        typeProduit: "COMPTE_TITRE",
        nomProduit: "CTO",
      })
    ).toEqual({ title: "CTO", subtitle: "Compte-Titres" });
    expect(
      inventoryRowLabels({
        typeProduit: "COMPTE_TITRE",
        nomProduit: "",
      })
    ).toEqual({ title: "Compte-Titres", subtitle: null });
  });
});
