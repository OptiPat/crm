import { describe, expect, it } from "vitest";
import {
  hasAnyFiscal,
  pickFiscal,
  resolveContactFiscal,
} from "./foyer-fiscal-sync";

describe("pickFiscal", () => {
  it("extrait uniquement les 4 champs fiscaux", () => {
    const source = {
      id: 1,
      nom: "DUPONT",
      tranche_imposition: "30 %",
      nombre_parts_fiscales: 2,
      revenu_fiscal_reference: 50000,
      ir_net_a_payer: 1200,
    };
    expect(pickFiscal(source)).toEqual({
      tranche_imposition: "30 %",
      nombre_parts_fiscales: 2,
      revenu_fiscal_reference: 50000,
      ir_net_a_payer: 1200,
    });
  });

  it("renvoie des undefined pour une source vide", () => {
    expect(pickFiscal(null)).toEqual({
      tranche_imposition: undefined,
      nombre_parts_fiscales: undefined,
      revenu_fiscal_reference: undefined,
      ir_net_a_payer: undefined,
    });
  });
});

describe("hasAnyFiscal", () => {
  it("false si tout est vide", () => {
    expect(hasAnyFiscal({})).toBe(false);
    expect(hasAnyFiscal(null)).toBe(false);
    expect(hasAnyFiscal({ tranche_imposition: "   " })).toBe(false);
  });

  it("true si au moins un champ est renseigné", () => {
    expect(hasAnyFiscal({ tranche_imposition: "30 %" })).toBe(true);
    expect(hasAnyFiscal({ nombre_parts_fiscales: 1 })).toBe(true);
    expect(hasAnyFiscal({ ir_net_a_payer: 0 })).toBe(true);
  });
});

describe("resolveContactFiscal", () => {
  it("privilégie la valeur du contact", () => {
    const result = resolveContactFiscal(
      { tranche_imposition: "41 %", nombre_parts_fiscales: 1 },
      { tranche_imposition: "30 %", nombre_parts_fiscales: 2 }
    );
    expect(result.tranche_imposition).toBe("41 %");
    expect(result.nombre_parts_fiscales).toBe(1);
  });

  it("retombe sur le foyer si le contact n'a pas la valeur (existant non backfillé)", () => {
    const result = resolveContactFiscal(
      {},
      { tranche_imposition: "30 %", revenu_fiscal_reference: 60000 }
    );
    expect(result.tranche_imposition).toBe("30 %");
    expect(result.revenu_fiscal_reference).toBe(60000);
  });

  it("célibataire sans foyer : utilise la valeur du contact", () => {
    const result = resolveContactFiscal(
      { tranche_imposition: "11 %" },
      null
    );
    expect(result.tranche_imposition).toBe("11 %");
    expect(result.ir_net_a_payer).toBeUndefined();
  });
});
