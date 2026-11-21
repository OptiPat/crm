import { describe, expect, it } from "vitest";
import { parseMrzLines, isMrzFullyVerified } from "@/lib/identity/mrz-parser";
import { repairMrzLines } from "@/lib/identity/mrz-repair";
import {
  ANONYMOUS_CNI_MRZ_LINE1,
  ANONYMOUS_CNI_MRZ_LINE2,
  ANONYMOUS_CNI_BIRTH_FR,
} from "@/lib/identity/fixtures/anonymous-cni-mrz";

/** Exemples ICAO 9303 (données fictives « ERIKSSON / UTO »). */
const TD3_L1 = "P<UTOERIKSSON<<ANNA<MARIA<<<<<<<<<<<<<<<<<<<";
const TD3_L2 = "L898902C36UTO7408122F1204159ZE184226B<<<<<10";
const TD1_L1 = "I<UTOD231458907<<<<<<<<<<<<<<<";
const TD1_L2 = "7408122F1204159UTO<<<<<<<<<<<6";
const TD1_L3 = "ERIKSSON<<ANNA<MARIA<<<<<<<<<<";

describe("parseMrzLines — correction par clés de contrôle", () => {
  it("passeport TD3 : dates lues avec des lettres (O, I, B) → corrigées", () => {
    const damaged = "L898902C36UTO74O8I22F12O4I59ZE184226B<<<<<10";
    const mrz = parseMrzLines([TD3_L1, damaged]);
    expect(mrz?.format).toBe("TD3");
    expect(mrz?.dateNaissance).toBe("12/08/1974");
    expect(mrz?.dateExpiration).toBe("15/04/2012");
    expect(mrz && isMrzFullyVerified(mrz)).toBe(true);
    expect(mrz?.checksVerified.expiryDate).toBe(true);
  });

  it("passeport TD3 : n° de document alphanumérique jamais modifié", () => {
    const damaged = "L89B902C36UTO7408122F1204159ZE184226B<<<<<10";
    const mrz = parseMrzLines([TD3_L1, damaged]);
    expect(mrz?.documentNumber).toBe("L89B902C3");
    expect(mrz?.checksVerified.documentNumber).toBe(false);
    expect(mrz?.checksVerified.birthDate).toBe(true);
  });

  it("carte TD1 : dates abîmées → corrigées", () => {
    const damagedL1 = TD1_L1;
    const damagedL2 = "74O8I22F12O4I59UTO<<<<<<<<<<<6";
    const mrz = parseMrzLines([damagedL1, damagedL2, TD1_L3]);
    expect(mrz?.format).toBe("TD1");
    expect(mrz?.documentNumber).toBe("D23145890");
    expect(mrz?.dateNaissance).toBe("12/08/1974");
    expect(mrz?.checksVerified).toEqual({
      documentNumber: true,
      birthDate: true,
      expiryDate: true,
    });
  });

  it("ancienne CNI française : chiffres lus comme lettres → corrigés", () => {
    const damaged = ANONYMOUS_CNI_MRZ_LINE2.replace(/^1234/, "I234").replace("850315", "85O3I5");
    const mrz = parseMrzLines([ANONYMOUS_CNI_MRZ_LINE1, damaged]);
    expect(mrz?.format).toBe("FRA_LEGACY");
    expect(mrz?.dateNaissance).toBe(ANONYMOUS_CNI_BIRTH_FR);
    expect(mrz?.checksVerified.documentNumber).toBe(true);
  });

  it("clé mal lue (7 → Z) : n° de document non « corrigé » en fausse valeur", () => {
    const damagedL1 = "I<UTOD23145890Z<<<<<<<<<<<<<<<";
    const mrz = parseMrzLines([damagedL1, TD1_L2, TD1_L3]);
    expect(mrz?.documentNumber).toBe("D23145890");
    expect(mrz?.checksVerified.documentNumber).toBe(false);
  });

  it("MRZ intacte : résultat identique (aucune régression)", () => {
    const mrz = parseMrzLines([TD1_L1, TD1_L2, TD1_L3]);
    expect(mrz?.documentNumber).toBe("D23145890");
    expect(mrz?.checksVerified.expiryDate).toBe(true);
    const passport = parseMrzLines([TD3_L1, TD3_L2]);
    expect(passport?.documentNumber).toBe("L898902C3");
    expect(passport && isMrzFullyVerified(passport)).toBe(true);
  });

  it("ne garde pas une « correction » qui ne valide pas plus de clés", () => {
    // Date de naissance fausse mais en chiffres : rien à corriger, clé toujours en échec.
    const wrong = "L898902C36UTO7408132F1204159ZE184226B<<<<<10";
    const mrz = parseMrzLines([TD3_L1, wrong]);
    expect(mrz?.checksVerified.birthDate).toBe(false);
  });

  it("repairMrzLines ne touche pas aux noms", () => {
    const [, , l3] = repairMrzLines([TD1_L1, TD1_L2, "ERIKSS0N<<ANNA<MARIA<<<<<<<<<<"]);
    expect(l3).toBe("ERIKSS0N<<ANNA<MARIA<<<<<<<<<<");
  });
});
