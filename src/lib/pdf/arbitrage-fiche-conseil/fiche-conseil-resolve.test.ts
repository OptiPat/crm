import { describe, expect, it } from "vitest";
import {
  FICHE_CONSEIL_EXCELITIS_MARKER,
  isExceltisFicheConseilTask,
  isFicheConseilTask,
  parseArbitrageInvestissementId,
} from "@/lib/alertes/arbitrage-alerte";
import {
  filterFicheConseilEligibleInvestissements,
  investissementToFicheProductKind,
  resolveFicheConseilProductKind,
  toFicheConseilContratPickItems,
} from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-resolve";
import type { Investissement } from "@/lib/api/tauri-investissements";

function inv(overrides: Partial<Investissement> = {}): Investissement {
  return {
    id: 1,
    contact_id: 10,
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat test",
    numero_contrat: "AV-1",
    prevoyance_perso: false,
    prevoyance_pro: false,
    versement_programme: false,
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    statut: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("fiche-conseil-resolve", () => {
  it("filtre les contrats AV/PER avec moi actifs", () => {
    const eligible = filterFicheConseilEligibleInvestissements([
      inv(),
      inv({ id: 2, type_produit: "SCPI" }),
      inv({ id: 3, origine: "EXISTANT_CLIENT" }),
    ]);
    expect(eligible).toHaveLength(1);
    expect(eligible[0].id).toBe(1);
  });

  it("déduit AV/PER depuis le contrat pour les tâches Exceltis", () => {
    expect(
      resolveFicheConseilProductKind({ titre: "Arbitrage Exceltis" }, inv())
    ).toBe("AV");
    expect(
      resolveFicheConseilProductKind({ titre: "Arbitrage Exceltis" }, inv({ type_produit: "PER" }))
    ).toBe("PER");
  });

  it("prépare les choix contrat", () => {
    const items = toFicheConseilContratPickItems([
      inv({ id: 1, numero_contrat: "AV-1" }),
      inv({ id: 2, type_produit: "PER", numero_contrat: "PER-2" }),
    ]);
    expect(items).toHaveLength(2);
    expect(items[0].productKind).toBe("AV");
    expect(items[1].productKind).toBe("PER");
  });

  it("mappe le type produit", () => {
    expect(investissementToFicheProductKind("ASSURANCE_VIE")).toBe("AV");
    expect(investissementToFicheProductKind("PER")).toBe("PER");
    expect(investissementToFicheProductKind("SCPI")).toBeNull();
  });
});

describe("fiche conseil markers", () => {
  it("parse investissement_id sur description multiligne", () => {
    const description = `${FICHE_CONSEIL_EXCELITIS_MARKER}\ncrm:investissement_id:42`;
    expect(parseArbitrageInvestissementId(description)).toBe(42);
  });

  it("détecte les tâches Exceltis et fiche conseil", () => {
    const tache = {
      titre: "Suivi Exceltis",
      description: FICHE_CONSEIL_EXCELITIS_MARKER,
    };
    expect(isExceltisFicheConseilTask(tache)).toBe(true);
    expect(isFicheConseilTask(tache)).toBe(true);
  });
});
