import { describe, expect, it } from "vitest";
import {
  buildCapitalInvestRecapDureeContent,
  buildCapitalInvestRecapObjectifsContent,
  buildCapitalInvestRecapProduitLabels,
  formatCapitalInvestProduitRecapLabel,
  resolveCapitalInvestDureeBlocageAnnees,
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

  it("résout la durée de blocage avec défaut 10 ans", () => {
    expect(resolveCapitalInvestDureeBlocageAnnees("")).toBe("10");
    expect(resolveCapitalInvestDureeBlocageAnnees("8")).toBe("8");
    expect(
      buildCapitalInvestRecapDureeContent({ capitalInvestDureeBlocageAnnees: "" })
    ).toContain("à minima de 10 ans");
    expect(
      buildCapitalInvestRecapDureeContent({ capitalInvestDureeBlocageAnnees: "8" })
    ).toContain("à minima de 8 ans");
  });
});
