import { describe, expect, it } from "vitest";
import { ANNEXES_G3F_CARACTERISTIQUES_OPERATION_SECTIONS } from "@/lib/souscription-cif/annexes-g3f-caracteristiques-operation-table";
import { ANNEXES_G3F_OBJECTIFS_PATRIMONIAUX_ROWS } from "@/lib/souscription-cif/annexes-g3f-objectifs-patrimoniaux-table";

describe("annexes-g3f-objectifs-patrimoniaux-table", () => {
  it("coche moyen/long terme et optimisation fiscale en Placements financiers", () => {
    expect(ANNEXES_G3F_OBJECTIFS_PATRIMONIAUX_ROWS).toHaveLength(5);
    expect(ANNEXES_G3F_OBJECTIFS_PATRIMONIAUX_ROWS[0]).toEqual({
      label: "Investir à moyen ou long terme",
      immobilier: false,
      placementsFinanciers: true,
    });
    expect(ANNEXES_G3F_OBJECTIFS_PATRIMONIAUX_ROWS[4]?.label).toBe(
      "Optimisation fiscale / Réduction d'impôt"
    );
    expect(ANNEXES_G3F_OBJECTIFS_PATRIMONIAUX_ROWS[4]?.placementsFinanciers).toBe(true);
  });
});

describe("annexes-g3f-caracteristiques-operation-table", () => {
  it("définit les avantages G3F (économies fiscales et accompagnement)", () => {
    const avantages = ANNEXES_G3F_CARACTERISTIQUES_OPERATION_SECTIONS[0];
    expect(avantages?.rows[3]?.placementsFinanciers).toEqual({ kind: "check", checked: true });
    expect(avantages?.rows[6]?.placementsFinanciers).toEqual({ kind: "check", checked: true });
    expect(avantages?.rows[0]?.placementsFinanciers).toEqual({ kind: "check", checked: false });
  });

  it("définit les inconvénients G3F (voir annexe PF, fiscalité décochée)", () => {
    const inconv = ANNEXES_G3F_CARACTERISTIQUES_OPERATION_SECTIONS[1];
    expect(inconv?.rows[0].immobilier).toEqual({ kind: "empty" });
    expect(inconv?.rows[0].placementsFinanciers).toEqual({
      kind: "text",
      value: "Voir détail en annexe",
      rowSpan: 3,
    });
    expect(inconv?.rows[3]?.placementsFinanciers).toEqual({ kind: "check", checked: false });
  });
});
