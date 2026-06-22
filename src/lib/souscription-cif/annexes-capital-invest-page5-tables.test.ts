import { describe, expect, it } from "vitest";
import { ANNEXES_CAPITAL_INVEST_CARACTERISTIQUES_OPERATION_SECTIONS } from "@/lib/souscription-cif/annexes-capital-invest-caracteristiques-operation-table";
import {
  ANNEXES_CAPITAL_INVEST_OBJECTIFS_PATRIMONIAUX_ROWS,
  formatCapitalInvestObjectifPatrimonialCheck,
} from "@/lib/souscription-cif/annexes-capital-invest-objectifs-patrimoniaux-table";

describe("annexes-capital-invest-objectifs-patrimoniaux-table", () => {
  it("coche Placements financiers uniquement", () => {
    expect(ANNEXES_CAPITAL_INVEST_OBJECTIFS_PATRIMONIAUX_ROWS).toHaveLength(4);
    for (const row of ANNEXES_CAPITAL_INVEST_OBJECTIFS_PATRIMONIAUX_ROWS) {
      expect(row.immobilier).toBe(false);
      expect(row.placementsFinanciers).toBe(true);
    }
  });

  it("utilise ⬜ / ☒", () => {
    expect(formatCapitalInvestObjectifPatrimonialCheck(false)).toBe("⬜");
    expect(formatCapitalInvestObjectifPatrimonialCheck(true)).toBe("☒");
  });
});

describe("annexes-capital-invest-caracteristiques-operation-table", () => {
  it("définit les avantages CI (PF cochés, complément retraite décoché)", () => {
    const avantages = ANNEXES_CAPITAL_INVEST_CARACTERISTIQUES_OPERATION_SECTIONS[0];
    expect(avantages?.title).toBe("Avantages");
    expect(avantages?.rows[3]?.label).toBe("Économies fiscales");
    expect(avantages?.rows[3]?.placementsFinanciers).toEqual({ kind: "check", checked: true });
    expect(avantages?.rows[5]?.label).toBe("Complément de revenu à la retraite");
    expect(avantages?.rows[5]?.placementsFinanciers).toEqual({ kind: "check", checked: false });
  });

  it("définit les inconvénients CI (texte SCPI + fiscalité PF)", () => {
    const inconv = ANNEXES_CAPITAL_INVEST_CARACTERISTIQUES_OPERATION_SECTIONS[1];
    expect(inconv?.rows[0].immobilier).toEqual({
      kind: "text",
      value: "Voir détail en annexe",
      rowSpan: 3,
    });
    expect(inconv?.rows[0].placementsFinanciers).toEqual({
      kind: "text",
      value: "Voir documents des sociétés de gestion\n+ brochure AMF",
      rowSpan: 3,
    });
    expect(inconv?.rows[3]?.label).toBe("Fiscalité et plus-values");
    expect(inconv?.rows[3]?.placementsFinanciers).toEqual({ kind: "check", checked: true });
  });
});
