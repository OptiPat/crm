import { describe, expect, it } from "vitest";
import {
  formatPlacementTemplateScopedLabel,
  normalizeStelliumBoxPlacementLabel,
  placementOperationTypeFromStelliumLabel,
  placementTemplateScopedTriggersOverlap,
  placementTemplateTriggerMatchesOperation,
  stelliumAffaireActLabelGroups,
  stelliumBoxPlacementLabelsMatch,
  stelliumBoxPlacementTemplateLabelGroups,
  stelliumLabelGroupsForProduct,
  stelliumSuiviActLabelGroups,
  isStelliumLabelAllowedForProduct,
  isStelliumLabelAllowedForAffaire,
  STELLIUM_BOX_PLACEMENT_LABELS,
} from "@/lib/placement/stellium-box-placement-labels";

describe("stellium-box-placement-labels", () => {
  it("normalise accents et espaces", () => {
    expect(normalizeStelliumBoxPlacementLabel("  Arbitrage libre ")).toBe("arbitrage libre");
    expect(normalizeStelliumBoxPlacementLabel("Modification administrative : RIB")).toBe(
      "modification administrative : rib"
    );
  });

  it("matche déclaration et mail", () => {
    expect(
      stelliumBoxPlacementLabelsMatch(
        "Modification administrative : RIB",
        "Modification administrative : RIB"
      )
    ).toBe(true);
    expect(
      stelliumBoxPlacementLabelsMatch("Arbitrage libre", "Modification administrative : RIB")
    ).toBe(false);
  });

  it("mappe le type email grossier", () => {
    expect(placementOperationTypeFromStelliumLabel("Arbitrage libre")).toBe("ARBITRAGE");
    expect(placementOperationTypeFromStelliumLabel("Modification administrative : RIB")).toBe(
      "AUTRE"
    );
    expect(
      placementOperationTypeFromStelliumLabel("Versements programmés : Mise en place")
    ).toBe("VERSEMENT");
  });

  it("contient les libellés gestion et SCPI", () => {
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain("Arbitrage libre");
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain("Modification administrative : RIB");
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain("Cession de parts");
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain(
      "Modification administrative : adresse / nom / RIB"
    );
    expect(STELLIUM_BOX_PLACEMENT_LABELS).toContain(
      "Réinvestissements des dividendes : Mise en place"
    );
    expect(STELLIUM_BOX_PLACEMENT_LABELS).not.toContain("Versement complémentaire");
  });

  it("mappe réinvestissement dividendes SCPI", () => {
    expect(
      placementOperationTypeFromStelliumLabel("Réinvestissements des dividendes : Modification")
    ).toBe("REINVESTISSEMENT");
  });

  it("filtre les actes selon le produit", () => {
    const scpiGroups = stelliumLabelGroupsForProduct("Comète");
    expect(scpiGroups).toHaveLength(1);
    expect(scpiGroups[0]?.id).toBe("scpi");
    expect(scpiGroups[0]?.items).toContain("Cession de parts");
    expect(scpiGroups[0]?.items).not.toContain("Arbitrage libre");

    const avGroups = stelliumLabelGroupsForProduct("Cristalliance Avenir");
    expect(avGroups.some((g) => g.id === "arbitrages")).toBe(true);
    expect(avGroups.some((g) => g.id === "scpi")).toBe(false);
    expect(isStelliumLabelAllowedForProduct("Arbitrage libre", "Cristalliance Avenir")).toBe(true);
    expect(isStelliumLabelAllowedForProduct("Cession de parts", "Cristalliance Avenir")).toBe(
      false
    );
    const suiviGroups = stelliumSuiviActLabelGroups("Cristalliance Avenir");
    const versementsGroup = suiviGroups.find((group) => group.id === "versements-programmes");
    expect(versementsGroup?.label).toBe("Versements");
    expect(versementsGroup?.items[0]).toBe("Versement complémentaire");

    const scpiSuiviGroups = stelliumSuiviActLabelGroups("Comète");
    expect(scpiSuiviGroups).toHaveLength(1);
    expect(scpiSuiviGroups[0]?.id).toBe("scpi");
    expect(scpiSuiviGroups.flatMap((g) => g.items)).not.toContain("Versement complémentaire");
    expect(
      isStelliumLabelAllowedForProduct("Versement complémentaire", "Comète", { suivi: true })
    ).toBe(false);
  });

  it("affaire classique : souscription seule", () => {
    expect(stelliumAffaireActLabelGroups()).toEqual([
      {
        id: "souscription-placement",
        label: "Souscription — placement",
        items: ["Souscription"],
      },
    ]);
    expect(isStelliumLabelAllowedForAffaire("Souscription")).toBe(true);
    expect(isStelliumLabelAllowedForAffaire("Arbitrage libre")).toBe(false);
    expect(
      isStelliumLabelAllowedForProduct("Souscription", "Cristalliance Avenir", { affaire: true })
    ).toBe(true);
    expect(
      isStelliumLabelAllowedForProduct("Arbitrage libre", "Cristalliance Avenir", { affaire: true })
    ).toBe(false);
  });

  it("catalogue modèles email : souscription placement avant SCPI", () => {
    const groups = stelliumBoxPlacementTemplateLabelGroups();
    const scpiIndex = groups.findIndex((group) => group.id === "scpi");
    const souscriptionIndex = groups.findIndex((group) => group.id === "souscription-placement");
    expect(souscriptionIndex).toBeGreaterThan(-1);
    expect(scpiIndex).toBeGreaterThan(souscriptionIndex);
  });

  it("trigger scopé : versements programmés placement vs SCPI", () => {
    const label = "Versements programmés : Mise en place";
    const placementScoped = formatPlacementTemplateScopedLabel("versements-programmes", label);
    const scpiScoped = formatPlacementTemplateScopedLabel("scpi", label);
    const avOp = {
      stellium_label: label,
      product_label: "Cristalliance Evoluvie",
    };
    const scpiOp = {
      stellium_label: label,
      product_label: "Comète",
    };
    expect(placementTemplateTriggerMatchesOperation(avOp, placementScoped)).toBe(true);
    expect(placementTemplateTriggerMatchesOperation(scpiOp, placementScoped)).toBe(false);
    expect(placementTemplateTriggerMatchesOperation(scpiOp, scpiScoped)).toBe(true);
    expect(placementTemplateTriggerMatchesOperation(avOp, scpiScoped)).toBe(false);
  });

  it("chevauchement legacy non scopé vs trigger SCPI scopé", () => {
    const label = "Versements programmés : Mise en place";
    expect(
      placementTemplateScopedTriggersOverlap(label, formatPlacementTemplateScopedLabel("scpi", label))
    ).toBe(true);
    expect(
      placementTemplateScopedTriggersOverlap(
        formatPlacementTemplateScopedLabel("versements-programmes", label),
        formatPlacementTemplateScopedLabel("scpi", label)
      )
    ).toBe(false);
  });
});
