import { describe, expect, it } from "vitest";
import { formatPlacementStelliumClientLabel } from "@/lib/placement/placement-stellium-client-labels";
import {
  AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
  STELLIUM_BOX_PLACEMENT_LABELS,
  stelliumBoxPlacementLabelsMatch,
} from "@/lib/placement/stellium-box-placement-labels";
import { VERSEMENT_COMPLEMENTAIRE_ACT_LABEL } from "@/lib/pipe/pipe-suivi";

describe("formatPlacementStelliumClientLabel", () => {
  it("couvre tout le catalogue Box + versement complémentaire + souscription", () => {
    const catalog = [
      ...STELLIUM_BOX_PLACEMENT_LABELS,
      VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
      AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
    ];
    const unique = catalog.filter(
      (label, index) => catalog.findIndex((item) => stelliumBoxPlacementLabelsMatch(item, label)) === index
    );
    for (const label of unique) {
      expect(formatPlacementStelliumClientLabel(label)).not.toBe(label);
      expect(formatPlacementStelliumClientLabel(label).length).toBeGreaterThan(0);
    }
  });
  it("corrections CGP : arbitrage libre et transfert entrant", () => {
    expect(formatPlacementStelliumClientLabel("Arbitrage libre")).toBe("l'arbitrage");
    expect(formatPlacementStelliumClientLabel("Transfert entrant")).toBe("le transfert");
  });

  it("mappe les libellés programmés", () => {
    expect(formatPlacementStelliumClientLabel("Arbitrages programmés : Mise en place")).toBe(
      "la mise en place d'arbitrages programmés"
    );
  });

  it("mappe le versement complémentaire", () => {
    expect(formatPlacementStelliumClientLabel("Versement complémentaire")).toBe(
      "le versement complémentaire"
    );
  });

  it("retombe sur le libellé brut si inconnu", () => {
    expect(formatPlacementStelliumClientLabel("Acte inconnu")).toBe("Acte inconnu");
    expect(formatPlacementStelliumClientLabel(null)).toBe("");
  });
});
