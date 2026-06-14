import { describe, expect, it } from "vitest";
import { ANNEXES_RAPPORT_DOCUMENT_TITLE } from "@/lib/souscription-cif/cif-documents";
import { buildAnnexesRapportPreview } from "@/lib/souscription-cif/render-annexes-rapport";

describe("buildAnnexesRapportPreview", () => {
  it("construit la page 1 SCPI avec titre, conseil et sections numérotées", () => {
    const preview = buildAnnexesRapportPreview("scpi", {
      conseil:
        "Afin de vous constituer du patrimoine et de répondre à vos objectifs, je vous conseille de souscrire des parts de SCPI en pleine propriété.",
    });

    expect(preview.pages).toHaveLength(4);
    const page = preview.pages[0];
    expect(page.title).toBe(ANNEXES_RAPPORT_DOCUMENT_TITLE);
    expect(page.headerLeft).toBeUndefined();
    expect(page.showAmfRiskScale).toBe(true);
    expect(page.amfRiskHighlightLevel).toBe(3);
    expect(page.amfRiskInvestmentHorizon).toBe("> 10 ans");

    expect(page.centeredSectionTitle).toBe("— LES SCPI DE RENDEMENT —");

    const intro = page.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(intro).toContain("souscrire des parts de SCPI en pleine propriété");

    const body = (page.bodySegmentsContinuation ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(body).toContain("1. Principe");
    expect(body).toContain("2. Caractéristiques des SCPI de rendement");
    expect(body).toContain("SCPI de rendement");
    expect(body).toContain("immeubles à usage commercial");
  });

  it("construit la page 2 avec la section fiscalité", () => {
    const preview = buildAnnexesRapportPreview("scpi", {});

    expect(preview.pages).toHaveLength(4);
    const page2 = preview.pages[1];
    expect(page2.pageNumber).toBe(2);
    expect(page2.title).toBeUndefined();

    const body = page2.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(body).toContain("3. Fiscalité");
    expect(body).toContain("3.1. Imposition des revenus");
    expect(body).toContain("17,2 %");
    expect(body).toContain("Remarque : si vous avez contracté un emprunt");
    expect(body).toContain("3.2. Imposition des plus-values");
    expect(body).toContain("3.3. Imposition sur la fortune immobilière (IFI)");

    const section4 = (page2.bodySegmentsAfterTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(section4).toContain("4. Avantages et inconvénients");
    expect(section4).toContain("4.1. D'un point de vue économique et juridique");
    expect(page2.showAnnexesProsConsTable).toBe(true);
  });

  it("construit la page 3 avec fiscalité § 4.2, tableau et risques", () => {
    const preview = buildAnnexesRapportPreview("scpi", {});

    const page3 = preview.pages[2];
    expect(page3.pageNumber).toBe(3);

    const title = page3.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(title).toBe("4.2. D'un point de vue fiscal");
    expect(page3.bodySegments.every((s) => s.kind !== "underline")).toBe(true);

    expect(page3.annexesProsConsRows).toHaveLength(2);
    expect(page3.showAnnexesProsConsTable).toBe(true);

    const risks = (page3.bodySegmentsAfterProsConsTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(risks).toContain("Risque de liquidité");
    expect(risks).toContain("Risque de perte en capital");
    expect(risks).toContain("Risque de variation des revenus distribués");
    expect(page3.annexesProsConsRows?.[0].disadvantages).toContain("17,2 %");
  });

  it("construit la page 4 avec préconisations et descriptions SCPI", () => {
    const preview = buildAnnexesRapportPreview("scpi", {
      mes_preconisations:
        "Mes préconisations portent sur un investissement global de 30 000 €, répartis ainsi :",
      descriptions_scpi: "Fiche Comète — …",
    });

    const page4 = preview.pages[3];
    expect(page4.pageNumber).toBe(4);
    const body = page4.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(body).toContain("30 000 €");
    expect(body).toContain("Fiche Comète");
  });
});
