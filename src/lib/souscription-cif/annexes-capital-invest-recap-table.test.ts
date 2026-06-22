import { describe, expect, it } from "vitest";
import {
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_CONNAISSANCES_CONTENT,
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_DUREE_CONTENT,
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_REEXAMEN_CONTENT,
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_RISQUE_CONTENT,
  buildCapitalInvestRecapObjectifsContent,
  buildCapitalInvestRecapProduitLabels,
  formatCapitalInvestProduitRecapLabel,
} from "@/lib/souscription-cif/annexes-capital-invest-recap-table";
import { newCapitalInvestAnnexeSouscription } from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";

describe("annexes-capital-invest-recap-table", () => {
  it("formate le libellé récap par type", () => {
    expect(formatCapitalInvestProduitRecapLabel("fcpi", "Odysée M2")).toBe("le FCPI Odysée M2");
    expect(formatCapitalInvestProduitRecapLabel("fcpr", "Odysée M2")).toBe("le FCPR Odysée M2");
  });

  it("génère la ligne objectifs avec un produit", () => {
    const text = buildCapitalInvestRecapObjectifsContent([
      newCapitalInvestAnnexeSouscription({
        id: "ci-1",
        type: "fcpi",
        nomFonds: "Odysée M2",
      }),
    ]);
    expect(text).toContain("le FCPI Odysée M2 permet de bénéficier");
    expect(text).not.toContain("{{");
  });

  it("accorde permettent pour plusieurs produits", () => {
    const labels = buildCapitalInvestRecapProduitLabels([
      newCapitalInvestAnnexeSouscription({
        id: "ci-1",
        type: "fcpi",
        nomFonds: "Odysée M2",
      }),
      newCapitalInvestAnnexeSouscription({
        id: "ci-2",
        type: "fip",
        nomFonds: "Proximité",
      }),
    ]);
    expect(labels).toEqual(["le FCPI Odysée M2", "le FIP Proximité"]);

    const text = buildCapitalInvestRecapObjectifsContent([
      newCapitalInvestAnnexeSouscription({ id: "ci-1", type: "fcpi", nomFonds: "Odysée M2" }),
      newCapitalInvestAnnexeSouscription({ id: "ci-2", type: "fip", nomFonds: "Proximité" }),
    ]);
    expect(text).toContain("le FCPI Odysée M2 et le FIP Proximité permettent");
  });

  it("laisse une variable si aucune souscription", () => {
    const text = buildCapitalInvestRecapObjectifsContent([]);
    expect(text).toContain("{{produits_capital_invest_cibles}}");
  });

  it("fixe la ligne durée à 7–10 ans selon millésimes", () => {
    expect(ANNEXES_CAPITAL_INVEST_RECAP_ROW_DUREE_CONTENT).toContain(
      "de 7 à 10 ans minimum, selon les millésimes souscrits"
    );
    expect(ANNEXES_CAPITAL_INVEST_RECAP_ROW_DUREE_CONTENT).toContain(
      "prorogée par la Société de gestion"
    );
  });

  it("référence le niveau QPI dans la ligne connaissances", () => {
    expect(ANNEXES_CAPITAL_INVEST_RECAP_ROW_CONNAISSANCES_CONTENT).toContain(
      "{{niveau_experience_qpi}}"
    );
    expect(ANNEXES_CAPITAL_INVEST_RECAP_ROW_CONNAISSANCES_CONTENT).toContain("DICI");
  });

  it("fixe les lignes risque et réexamen (fonds fermés)", () => {
    expect(ANNEXES_CAPITAL_INVEST_RECAP_ROW_RISQUE_CONTENT).toContain("épargne de précaution");
    expect(ANNEXES_CAPITAL_INVEST_RECAP_ROW_RISQUE_CONTENT).toContain("part mineure");
    expect(ANNEXES_CAPITAL_INVEST_RECAP_ROW_REEXAMEN_CONTENT).toContain("Non.");
    expect(ANNEXES_CAPITAL_INVEST_RECAP_ROW_REEXAMEN_CONTENT).toContain("fonds fermés");
    expect(ANNEXES_CAPITAL_INVEST_RECAP_ROW_REEXAMEN_CONTENT).toContain("vocation fiscale");
  });
});
