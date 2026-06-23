import { describe, expect, it } from "vitest";
import {
  buildG3fInvestmentVariables,
  formatG3fEuroDisplay,
  resolveG3fTotalApportDisplay,
} from "@/lib/souscription-cif/build-g3f-investment-calc";
import { defaultSouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

describe("build-g3f-investment-calc", () => {
  it("formate les montants sans suffixe €", () => {
    expect(formatG3fEuroDisplay("12000")).toBe("12\u202f000");
    expect(formatG3fEuroDisplay("1 200,50")).toBe("1\u202f200,5");
  });

  it("calcule le total apport à partir de l'apport et des frais", () => {
    expect(resolveG3fTotalApportDisplay("10000", "500", "")).toBe("10\u202f500");
    expect(resolveG3fTotalApportDisplay("10000", "500", "11000")).toBe("11\u202f000");
  });

  it("expose les variables G3F calcul investissement", () => {
    const vars = buildG3fInvestmentVariables({
      ...defaultSouscriptionDossierFields(),
      g3fAnneeImpot: "2025",
      g3fMontantImpotEur: "25000",
      g3fReductionSouhaiteeEur: "15000",
      g3fMontantApportEur: "12000",
      g3fFraisEnregistrementEur: "300",
      g3fAnneeLoiFinances: "2025",
      g3fAnneeSouscription: "2025",
      g3fAnneeDeclarationRevenus: "2025",
    });
    expect(vars.g3f_annee_impot).toBe("2025");
    expect(vars.g3f_montant_impot).toBe("25\u202f000");
    expect(vars.g3f_annee_declaration_revenus).toBe("2025");
    expect(vars.g3f_total_apport).toBe("12\u202f300");
  });
});
