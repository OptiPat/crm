import { describe, expect, it } from "vitest";
import { formatEuroAmountCif, formatPercentCif } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { ANNEXES_RAPPORT_DOCUMENT_TITLE } from "@/lib/souscription-cif/cif-documents";
import {
  defaultSouscriptionDossierFields,
} from "@/lib/souscription-cif/dossier-fields";
import { buildMesPreconisationsFromSouscriptions } from "@/lib/souscription-cif/scpi-annexe-souscriptions";
import { buildAnnexesRapportPreview } from "@/lib/souscription-cif/render-annexes-rapport";

const cometeAnnexeRow = {
  productKey: "comete",
  montantSouscritEur: "30000",
  partPriceEur: "250",
  reinvestissementDividendesPct: "100",
  vpMontantEur: "50",
  vpFrequence: "mois" as const,
};

describe("buildAnnexesRapportPreview", () => {
  it("construit la page 1 SCPI avec titre, conseil et sections numérotées", () => {
    const preview = buildAnnexesRapportPreview(
      "scpi",
      {
        conseil:
          "Afin de vous constituer du patrimoine et de répondre à vos objectifs, je vous conseille de souscrire des parts de SCPI en pleine propriété.",
      },
      defaultSouscriptionDossierFields()
    );

    expect(preview.pages).toHaveLength(9);
    const page = preview.pages[0];
    expect(page.title).toBe(ANNEXES_RAPPORT_DOCUMENT_TITLE);
    expect(page.headerLeft).toBeUndefined();
    expect(page.showAmfRiskScale).toBe(true);
    expect(page.amfRiskHighlightLevel).toBe(3);
    expect(page.amfRiskInvestmentHorizon).toBe("> 10 ans");

    expect(page.centeredSectionTitle).toBe("— LES SCPI DE RENDEMENT —");

    const intro = page.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(intro).toContain("souscrire des parts de SCPI en pleine propriété");

    const body = (page.bodySegmentsContinuation ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(body).toContain("1. Principe et caractéristiques des SCPI de rendement");
    expect(body).toMatch(
      /1\. Principe et caractéristiques des SCPI de rendement\n\nLes SCPI \(Société Civile/
    );
    expect(body).toContain("SCPI de rendement");
    expect(body).toContain("immeubles à usage commercial");
  });

  it("construit la page 2 avec la section fiscalité", () => {
    const preview = buildAnnexesRapportPreview("scpi", {}, defaultSouscriptionDossierFields());

    expect(preview.pages).toHaveLength(9);
    const page2 = preview.pages[1];
    expect(page2.pageNumber).toBe(2);
    expect(page2.title).toBeUndefined();

    const body = page2.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(body).toContain("2. Fiscalité");
    expect(body).toContain("2.1. Imposition des revenus");
    expect(body).toContain("revenus fonciers");
    expect(body).toContain("17,2 %");
    expect(body).toContain("Remarque : si vous avez contracté un emprunt");
    expect(body).toContain("2.2. Imposition des plus-values");
    expect(body).toContain("2.3. Imposition sur la fortune immobilière (IFI)");
    expect(page2.showAnnexesProsConsTable).toBeUndefined();
  });

  it("construit la page 3 avec modalités d'acquisition uniquement", () => {
    const preview = buildAnnexesRapportPreview("scpi", {}, defaultSouscriptionDossierFields());

    const page3 = preview.pages[2];
    expect(page3.pageNumber).toBe(3);

    const body = page3.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(body).toContain("3. Modalités d'acquisition");
    expect(body).toContain("Acquisition en démembrement de propriété");
    expect(body).toContain("nu-propriétaire");
    expect(body).toContain("usufruitier");
    expect(body).toContain("ne pas être assujetti à l'IFI");
    expect(page3.bodySegmentsAfterTable).toBeUndefined();
    expect(page3.showAnnexesProsConsTable).toBeUndefined();
  });

  it("construit la page 4 avec § 4.1, § 4.2 fiscal, tableaux et risques", () => {
    const preview = buildAnnexesRapportPreview("scpi", {}, defaultSouscriptionDossierFields());

    const page4 = preview.pages[3];
    expect(page4.pageNumber).toBe(4);

    const intro = page4.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(intro).toContain("4. Avantages et inconvénients");
    expect(intro).toContain("4.1. D'un point de vue économique et juridique");
    expect(page4.bodySegments.some((s) => s.kind === "underline" && s.value.includes("4.1."))).toBe(
      false
    );
    expect(page4.showAnnexesProsConsTable).toBe(true);

    const section42 = (page4.bodySegmentsAfterProsConsTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(section42).toBe("4.2. D'un point de vue fiscal");

    expect(page4.annexesProsConsFiscalRows).toHaveLength(2);
    expect(page4.annexesProsConsFiscalRows?.[0].disadvantages).toContain("17,2 %");

    const risks = (page4.bodySegmentsAfterFiscalProsConsTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(risks).toContain("Risque de liquidité");
    expect(risks).toContain("Risque de perte en capital");
    expect(risks).toContain("Risque de variation des revenus distribués");
  });

  it("construit la page 5 avec préconisations et descriptions SCPI", () => {
    const preview = buildAnnexesRapportPreview(
      "scpi",
      {
        mes_preconisations:
          "Mes préconisations portent sur un investissement global de 30 000 €, répartis ainsi :",
        descriptions_scpi: "Fiche Comète — …",
      },
      defaultSouscriptionDossierFields()
    );

    const page5 = preview.pages[4];
    expect(page5.pageNumber).toBe(5);
    const body = page5.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(body).toContain("30 000 €");
    expect(body).toContain("Fiche Comète");
  });

  it("construit la page 6 avec le tableau récapitulatif d'adéquation", () => {
    const preview = buildAnnexesRapportPreview(
      "scpi",
      {
        rappel_demande:
          "Les objectifs du client sont : d'obtenir des revenus complémentaires et d'optimiser la rentabilité de ses placements.",
      },
      {
        ...defaultSouscriptionDossierFields(),
        scpiAnnexeSouscriptions: [cometeAnnexeRow],
        mesPreconisations: buildMesPreconisationsFromSouscriptions([cometeAnnexeRow]),
        quotePartPercueConsultantCifEur: "900",
      }
    );

    const page6 = preview.pages[5];
    expect(page6.pageNumber).toBe(6);
    expect(page6.title).toBeUndefined();
    expect(page6.bodySegments).toHaveLength(0);
    expect(page6.rapportRecapTableHeader).toBe("TABLEAU RÉCAPITULATIF");
    expect(page6.rapportRecapRows).toHaveLength(6);

    const titles = page6.rapportRecapRows?.map((r) => r.title) ?? [];
    expect(titles[0]).toContain("adaptée au client");
    expect(titles[1]).toContain("conforme aux objectifs");
    expect(titles[5]).toContain("réexamen périodique");

    const objectifsCell = page6.rapportRecapRows?.[1].contentSegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(objectifsCell).toContain("revenus complémentaires");
    expect(preview.missingKeys).not.toContain("rappel_demande");

    const connaissancesCell = page6.rapportRecapRows?.[3].contentSegments
      .map((s) => (s.kind === "text" ? s.value : ""))
      .join("");
    expect(connaissancesCell).toContain("Novice");
    expect(connaissancesCell).toContain("DIC, Statuts");

    expect(page6.showAnnexesCostsTable).toBe(true);
    const costsIntro = page6.bodySegmentsAfterRecapTable
      ?.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(costsIntro).toContain("Informations sur les coûts et les frais");
    expect(page6.bodySegmentsAfterRecapTable?.some((s) => s.kind === "underline")).toBe(true);

    const tiersRow = page6.annexesCostsRows?.find((r) =>
      r.label.includes("Paiement reçu de tiers")
    );
    expect(tiersRow?.amount).toBe(formatEuroAmountCif(900));
    expect(tiersRow?.percent).toBe(formatPercentCif(900 / 30_000));

    const productsRow = page6.annexesCostsRows?.find((r) => r.label === "Coûts liés aux produits");
    expect(productsRow?.amount).toBe(formatEuroAmountCif(999));
    expect(productsRow?.percent).toBe(formatPercentCif(999 / 30_000));

    const totalRow = page6.annexesCostsRows?.find((r) => r.label === "TOTAL COÛTS ET FRAIS");
    expect(totalRow?.amount).toBe(formatEuroAmountCif(1899));

    const costsFooter = page6.bodySegmentsAfterCostsTable
      ?.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(costsFooter).toContain("ventilation plus précise");
  });

  it("construit la page 7 avec préconisations conseiller et tableau objectifs", () => {
    const preview = buildAnnexesRapportPreview(
      "scpi",
      {},
      defaultSouscriptionDossierFields()
    );

    const page7 = preview.pages[6];
    expect(page7.pageNumber).toBe(7);
    expect(page7.showAnnexesObjectifsPatrimoniauxTable).toBe(true);

    const section1 = page7.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section1).toContain("1. Préconisations du conseiller");
    expect(section1).toContain("perspective long terme");

    const section2 = page7.bodySegmentsAfterTable
      ?.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section2).toContain("2. Objectifs patrimoniaux");

    const rows = page7.annexesObjectifsPatrimoniauxRows ?? [];
    expect(rows).toHaveLength(4);
    expect(rows[0].label).toContain("Investir à moyen ou long terme");
    expect(rows.every((r) => r.immobilier && r.placementsFinanciers)).toBe(true);

    expect(page7.showAnnexesCaracteristiquesOperationTable).toBe(true);
    const section3 = page7.bodySegmentsAfterObjectifsPatrimoniauxTable
      ?.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section3).toContain("3. Caractéristiques de l'opération");

    const avantages = page7.annexesCaracteristiquesOperationSections?.[0];
    expect(avantages?.title).toBe("Avantages");
    expect(avantages?.rows).toHaveLength(7);
    expect(avantages?.rows[3].label).toBe("Économies fiscales");
    expect(avantages?.rows[3].immobilier).toEqual({ kind: "check", checked: false });

    const inconv = page7.annexesCaracteristiquesOperationSections?.[1];
    expect(inconv?.rows[0].immobilier).toEqual({
      kind: "text",
      value: "Voir détail en annexe",
      rowSpan: 3,
    });
    expect(inconv?.rows[1].immobilier).toEqual({ kind: "span-continue" });
    expect(inconv?.rows[3].label).toBe("Fiscalité et plus-values");

    expect(page7.showAnnexesHorizonProfilTable).toBe(true);
    const section4 = page7.bodySegmentsAfterCaracteristiquesOperationTable
      ?.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section4).toContain("4. Horizon et profil d'investissement");
    expect(page7.annexesHorizonProfilRows?.[2].horizon).toMatchObject({
      label: "+ de 10 ans",
      checked: true,
    });
  });

  it("construit la page 8 avec déclaration origine des fonds", () => {
    const preview = buildAnnexesRapportPreview(
      "scpi",
      {},
      {
        ...defaultSouscriptionDossierFields(),
        provenanceFonds: "metropole",
        origineFondsSelected: ["epargne_courante", "epargne_constituee"],
      }
    );

    const page8 = preview.pages[7];
    expect(page8.pageNumber).toBe(8);
    expect(page8.showAnnexesOrigineFondsSection).toBe(true);

    const intro = page8.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(intro).toContain("5. Déclaration sur l'honneur");
    expect(intro).toContain("R.561-38");

    expect(page8.annexesOrigineFondsView?.provenanceFonds).toBe("metropole");
    expect(page8.annexesOrigineFondsView?.origineFondsSelected).toEqual([
      "epargne_courante",
      "epargne_constituee",
    ]);

    const certification = page8.bodySegmentsAfterOrigineFonds
      ?.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(certification).toContain("Certifie sur l'honneur");

    const section6 = page8.bodySegmentsSection6Intro
      ?.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section6).toContain("6. Informations");
    expect(section6).toContain("Documents officiels");
    expect(section6).toContain("☒ Oui");
    expect(section6).toContain("⬜ Non");

    expect(
      page8.bodySegmentsSection7?.some(
        (s) => s.kind === "bold" && s.value.includes("Le CIF déclare")
      )
    ).toBe(true);
    const section7 = page8.bodySegmentsSection7
      ?.map((s) =>
        s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""
      )
      .join("");
    expect(section7).toContain("7. Notes importantes");
    expect(section7).toContain("Je déclare que les préconisations");

    expect(preview.missingKeys).not.toContain("provenance_fonds");
    expect(preview.missingKeys).not.toContain("origine_fonds");
  });

  it("signale provenance et origine manquantes", () => {
    const preview = buildAnnexesRapportPreview("scpi", {}, defaultSouscriptionDossierFields());
    expect(preview.missingKeys).toContain("provenance_fonds");
    expect(preview.missingKeys).toContain("origine_fonds");
  });

  it("construit la page 9 avec en-tête client / conseiller et renonciation", () => {
    const preview = buildAnnexesRapportPreview(
      "scpi",
      {
        client_nom_prenom: "Luc ALAMEDA",
        client_adresse: "12 rue des Oliviers",
        client_cp_ville: "34000 Montpellier",
        client_ville: "Montpellier",
        date_document: "13/06/2026",
        cgp_formule_politesse: "Nicolas PLAZA,",
        cgp_nom_complet: "Nicolas PLAZA",
        cgp_adresse_ligne: "4 impasse des arbousiers",
        cgp_cp_ville: "34660 Cournonsec",
      },
      defaultSouscriptionDossierFields()
    );

    const page9 = preview.pages[8];
    expect(page9.pageNumber).toBe(9);

    const seg = (s: { kind: string; value?: string; label?: string }) =>
      s.kind === "text" || s.kind === "underline" || s.kind === "bold"
        ? s.value
        : `[${s.label}]`;

    const headerLeft = page9.headerLeft!
      .map((line) => line.map(seg).join(""))
      .join("\n");
    expect(headerLeft).toContain("Luc ALAMEDA");
    expect(headerLeft).toContain("12 rue des Oliviers");
    expect(headerLeft).toContain("34000 Montpellier");

    const headerRight = page9.headerRight!
      .map((line) => line.map(seg).join(""))
      .join("\n");
    expect(headerRight).toContain("Nicolas PLAZA");
    expect(headerRight).toContain("4 impasse des arbousiers");
    expect(headerRight).toContain("34660 Cournonsec");
    expect(headerRight).toContain("À Montpellier, le 13/06/2026");

    const body = page9.bodySegments.map(seg).join("");
    expect(body).toContain("Objet : Renonciation au délai de rétractation.");
    expect(page9.bodySegments.some((s) => s.kind === "underline" && s.value.startsWith("Objet :"))).toBe(
      true
    );
    expect(body).toContain("Nicolas PLAZA,");
    expect(body).not.toContain("Monsieur");
    expect(body).toContain("Je renonce à mon délai de rétractation de 14 jours");
    expect(body).toContain("Je vous remercie de démarrer votre prestation dès à présent.");
  });
});
