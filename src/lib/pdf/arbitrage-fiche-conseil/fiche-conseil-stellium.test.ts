import { describe, expect, it } from "vitest";
import {
  FICHE_CONSEIL_ARBITRAGE_ACT_LABEL,
  FICHE_CONSEIL_VP_MISE_EN_PLACE_ACT_LABEL,
  FICHE_CONSEIL_VP_MODIFICATION_ACT_LABEL,
  isStelliumActEligibleForFicheConseil,
  isVpModificationStelliumAct,
  isVpMiseEnPlaceStelliumAct,
  resolveFicheConseilTemplateFamily,
  resolveStelliumProductLabelFromCrmInvestissement,
  resolveStelliumProductLabelFromNomProduit,
  stelliumProductLabelToFicheProductKind,
} from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-stellium";
import { filterFicheConseilContratPickItemsByProductKind } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-resolve";

describe("fiche-conseil-stellium", () => {
  it("détecte arbitrage AV/PER éligible", () => {
    expect(
      isStelliumActEligibleForFicheConseil("Arbitrage libre", "Cristalliance Avenir")
    ).toBe(true);
    expect(
      isStelliumActEligibleForFicheConseil("Arbitrage libre", "Corum Origin")
    ).toBe(false);
    expect(
      isStelliumActEligibleForFicheConseil("Rachat partiel", "Cristalliance Avenir")
    ).toBe(false);
  });

  it("détecte modification VP AV/PER éligible", () => {
    expect(
      isStelliumActEligibleForFicheConseil(
        FICHE_CONSEIL_VP_MODIFICATION_ACT_LABEL,
        "Cristalliance Avenir"
      )
    ).toBe(true);
    expect(
      isStelliumActEligibleForFicheConseil(
        FICHE_CONSEIL_VP_MODIFICATION_ACT_LABEL,
        "Corum Origin"
      )
    ).toBe(false);
    expect(
      resolveFicheConseilTemplateFamily(FICHE_CONSEIL_VP_MODIFICATION_ACT_LABEL)
    ).toBe("VP_MODIFICATION");
    expect(resolveFicheConseilTemplateFamily("Arbitrage libre")).toBe("ARBITRAGE");
    expect(isVpModificationStelliumAct("Versements programmés : Modification")).toBe(true);
  });

  it("détecte mise en place VP AV/PER éligible", () => {
    expect(
      isStelliumActEligibleForFicheConseil(
        FICHE_CONSEIL_VP_MISE_EN_PLACE_ACT_LABEL,
        "Cristalliance Avenir"
      )
    ).toBe(true);
    expect(
      isStelliumActEligibleForFicheConseil(
        FICHE_CONSEIL_VP_MISE_EN_PLACE_ACT_LABEL,
        "Cristalliance EvoluPER"
      )
    ).toBe(true);
    expect(
      isStelliumActEligibleForFicheConseil(
        FICHE_CONSEIL_VP_MISE_EN_PLACE_ACT_LABEL,
        "Corum Origin"
      )
    ).toBe(false);
    expect(
      resolveFicheConseilTemplateFamily(FICHE_CONSEIL_VP_MISE_EN_PLACE_ACT_LABEL)
    ).toBe("VP_MISE_EN_PLACE");
    expect(isVpMiseEnPlaceStelliumAct("Versements programmés : Mise en place")).toBe(true);
  });

  it("mappe produit Stellium vers AV/PER", () => {
    expect(stelliumProductLabelToFicheProductKind("Cristalliance Avenir")).toBe("AV");
    expect(stelliumProductLabelToFicheProductKind("Cristalliance EvoluPER")).toBe("PER");
  });

  it("associe nom produit CRM au catalogue Stellium", () => {
    expect(resolveStelliumProductLabelFromNomProduit("cristalliance avenir")).toBe(
      "Cristalliance Avenir"
    );
    expect(
      resolveStelliumProductLabelFromCrmInvestissement({
        type_produit: "ASSURANCE_VIE",
        nom_produit: "Vie Plus",
        partenaireNom: "Suravenir",
      })
    ).toBe("Cristalliance Avenir");
    expect(
      resolveStelliumProductLabelFromCrmInvestissement({
        type_produit: "PER",
        nom_produit: "EvoluPER",
        partenaireNom: "Apicil",
      })
    ).toBe("Cristalliance EvoluPER");
    expect(resolveStelliumProductLabelFromNomProduit("Produit inconnu")).toBeNull();
  });

  it("utilise Arbitrage libre comme acte par défaut", () => {
    expect(FICHE_CONSEIL_ARBITRAGE_ACT_LABEL).toBe("Arbitrage libre");
  });
});

describe("filterFicheConseilContratPickItemsByProductKind", () => {
  it("filtre par type AV ou PER", () => {
    const items = [
      { investissementId: 1, label: "AV", productKind: "AV" as const },
      { investissementId: 2, label: "PER", productKind: "PER" as const },
    ];
    expect(filterFicheConseilContratPickItemsByProductKind(items, "AV")).toEqual([items[0]]);
  });
});
