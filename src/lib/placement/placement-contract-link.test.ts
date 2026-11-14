import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  contractLinkCandidates,
  defaultContractLinkId,
  stelliumActUpdatesContract,
  vpFrequenceFromStelliumAct,
} from "./placement-contract-link";
import { validateSuiviStelliumActInput, mapSuiviStelliumActRowToInput } from "./suivi-stellium-acts";
import { EMPTY_VP_MODIFICATION_ACT_VALUE } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
import { EMPTY_VP_MISE_EN_PLACE_ACT_VALUE } from "@/lib/pdf/arbitrage-fiche-conseil/vp-mise-en-place-types";

const inv = (id: number, type_produit: string, statut?: string): Investissement =>
  ({
    id,
    contact_id: 1,
    type_produit,
    nom_produit: `Contrat ${id}`,
    origine: "MON_CONSEIL",
    statut,
  }) as Investissement;

describe("placement-contract-link", () => {
  it("identifie les actes reportés sur la fiche placement", () => {
    expect(stelliumActUpdatesContract("Versement complémentaire")).toBe(true);
    expect(stelliumActUpdatesContract("Versements programmés : Modification")).toBe(true);
    expect(stelliumActUpdatesContract("Arbitrage libre")).toBe(true);
    expect(stelliumActUpdatesContract("Arbitrages programmés : Mise en place")).toBe(false);
    expect(stelliumActUpdatesContract("Rachat partiel")).toBe(false);
  });

  it("ne propose que les contrats AV / PER / capitalisation actifs", () => {
    const list = contractLinkCandidates([
      inv(1, "ASSURANCE_VIE"),
      inv(2, "SCPI"),
      inv(3, "PER", "CLOTURE"),
      inv(4, "CONTRAT_CAPITALISATION"),
    ]);
    expect(list.map((i) => i.id)).toEqual([1, 4]);
  });

  it("pré-sélectionne le contrat unique, sinon laisse choisir", () => {
    expect(defaultContractLinkId([inv(1, "PER")], new Map(), "")).toBe(1);
    expect(defaultContractLinkId([inv(1, "PER"), inv(2, "PER")], new Map(), "")).toBeNull();
  });

  it("reporte la fréquence VP seulement si elle est saisie", () => {
    expect(
      vpFrequenceFromStelliumAct("Versements programmés : Mise en place", undefined, {
        ...EMPTY_VP_MISE_EN_PLACE_ACT_VALUE,
        frequence: "TRIMESTRIEL",
      })
    ).toBe("TRIMESTRIEL");
    expect(
      vpFrequenceFromStelliumAct(
        "Versements programmés : Modification",
        { ...EMPTY_VP_MODIFICATION_ACT_VALUE, kinds: ["montant"], frequence: "ANNUEL" },
        undefined
      )
    ).toBeNull();
    expect(
      vpFrequenceFromStelliumAct(
        "Versements programmés : Modification",
        { ...EMPTY_VP_MODIFICATION_ACT_VALUE, kinds: ["periodicite"], frequence: "ANNUEL" },
        undefined
      )
    ).toBe("ANNUEL");
  });

  it("exige le contrat quand un contrat éligible existe", () => {
    const act = {
      productLabel: "",
      actLabel: "Versement complémentaire",
      montantCentimes: 100_000,
      contractRequired: true,
    };
    expect(validateSuiviStelliumActInput(act)).toMatch(/contrat concerné/);
    expect(validateSuiviStelliumActInput({ ...act, investissementId: 7 })).toBeNull();
    expect(validateSuiviStelliumActInput({ ...act, contractRequired: false })).toBeNull();
  });

  it("transmet contrat et obligation depuis la ligne de formulaire", () => {
    const input = mapSuiviStelliumActRowToInput({
      productLabel: "",
      actLabel: "Rachat partiel",
      montantEuros: "",
      investissementId: 3,
      contractRequired: true,
    });
    expect(input.investissementId).toBe(3);
    // Acte non reporté sur la fiche : pas d'obligation de contrat.
    expect(input.contractRequired).toBe(false);
  });
});
