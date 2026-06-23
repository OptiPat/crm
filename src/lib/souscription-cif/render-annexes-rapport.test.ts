import { describe, expect, it } from "vitest";
import { formatEuroAmountCif, formatPercentCif } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import { ANNEXES_RAPPORT_DOCUMENT_TITLE } from "@/lib/souscription-cif/cif-documents";
import {
  defaultSouscriptionDossierFields,
} from "@/lib/souscription-cif/dossier-fields";
import { buildMesPreconisationsFromSouscriptions } from "@/lib/souscription-cif/scpi-annexe-souscriptions";
import { buildCifProseBlocks } from "@/components/souscription-cif/CifProse";
import { ANNEXES_G3F_SECTION5_BODY } from "@/lib/souscription-cif/annexes-rapport-g3f-page2";
import { ANNEXES_G3F_SECTION6_BODY } from "@/lib/souscription-cif/annexes-rapport-g3f-page3";
import { buildAnnexesRapportPreview } from "@/lib/souscription-cif/render-annexes-rapport";
import { renderTemplateSegments } from "@/lib/souscription-cif/render-template";

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

    expect(preview.pages).toHaveLength(10);
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

    expect(preview.pages).toHaveLength(10);
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
    expect(risks).toContain("- Risque de liquidité");
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
        niveau_experience_qpi: "Expérimenté",
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
    expect(connaissancesCell).toContain("Expérimenté");
    expect(connaissancesCell).not.toContain("Novice");
    expect(connaissancesCell).toContain("DIC, Statuts");
    expect(preview.missingKeys).not.toContain("niveau_experience_qpi");

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
      {
        client_ville: "Lyon",
        date_document: "22/06/2025",
        cgp_nom_complet: "MARTIN Pierre",
        client_nom_prenom: "BERNARD Luc",
      },
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

    expect(page8.bodySegmentsSection7).toBeUndefined();
    expect(page8.bodySegmentsAfterSection7).toBeUndefined();
    expect(page8.signatureColumns).toBeUndefined();

    const page9 = preview.pages[8];
    expect(page9.pageNumber).toBe(9);
    expect(page9.showAnnexesOrigineFondsSection).toBeUndefined();

    expect(
      page9.bodySegmentsSection7?.some(
        (s) => s.kind === "bold" && s.value.includes("Le CIF déclare")
      )
    ).toBe(true);
    const section7 = page9.bodySegmentsSection7
      ?.map((s) =>
        s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""
      )
      .join("");
    expect(section7).toContain("7. Notes importantes");
    expect(section7).toContain("Je déclare que les préconisations");

    const faitA = page9.bodySegmentsAfterSection7
      ?.map((s) =>
        s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""
      )
      .join("");
    expect(faitA).toBe("Fait à Lyon, le 22/06/2025.");

    const sigLeft = (page9.signatureColumns?.left ?? [])
      .map((line) =>
        line.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : "")).join("")
      )
      .join("\n");
    expect(sigLeft).toContain("Signature du conseiller");
    expect(sigLeft).toContain("Lu et Approuvé");
    expect(sigLeft).toContain("MARTIN Pierre");

    const sigRight = (page9.signatureColumns?.right ?? [])
      .map((line) =>
        line.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : "")).join("")
      )
      .join("\n");
    expect(sigRight).toContain("Signature du client");
    expect(sigRight).toContain("exactitude des renseignements");
    expect(sigRight).toContain("BERNARD Luc");

    expect(preview.missingKeys).not.toContain("provenance_fonds");
    expect(preview.missingKeys).not.toContain("origine_fonds");
  });

  it("signale provenance et origine manquantes", () => {
    const preview = buildAnnexesRapportPreview("scpi", {}, defaultSouscriptionDossierFields());
    expect(preview.missingKeys).toContain("provenance_fonds");
    expect(preview.missingKeys).toContain("origine_fonds");
  });

  it("construit la page 10 avec en-tête client / conseiller et renonciation", () => {
    const preview = buildAnnexesRapportPreview(
      "scpi",
      {
        client_nom_prenom: "Luc BERNARD",
        client_adresse: "12 rue des Oliviers",
        client_cp_ville: "34000 Montpellier",
        client_ville: "Montpellier",
        date_document: "13/06/2026",
        cgp_formule_politesse: "Jean DUPONT,",
        cgp_nom_complet: "Jean DUPONT",
        cgp_adresse_ligne: "4 impasse des arbousiers",
        cgp_cp_ville: "34660 Cournonsec",
      },
      defaultSouscriptionDossierFields()
    );

    const page10 = preview.pages[9];
    expect(page10.pageNumber).toBe(10);

    const seg = (s: { kind: string; value?: string; label?: string }) =>
      s.kind === "text" || s.kind === "underline" || s.kind === "bold"
        ? s.value
        : `[${s.label}]`;

    const headerLeft = page10.headerLeft!
      .map((line) => line.map(seg).join(""))
      .join("\n");
    expect(headerLeft).toContain("Luc BERNARD");
    expect(headerLeft).toContain("12 rue des Oliviers");
    expect(headerLeft).toContain("34000 Montpellier");

    const headerRight = page10.headerRight!
      .map((line) => line.map(seg).join(""))
      .join("\n");
    expect(headerRight).toContain("Jean DUPONT");
    expect(headerRight).toContain("4 impasse des arbousiers");
    expect(headerRight).toContain("34660 Cournonsec");
    expect(headerRight).toContain("À Montpellier, le 13/06/2026");

    const body = page10.bodySegments.map(seg).join("");
    expect(body).toContain("Objet : Renonciation au délai de rétractation.");
    expect(page10.bodySegments.some((s) => s.kind === "underline" && s.value.startsWith("Objet :"))).toBe(
      true
    );
    expect(body).toContain("Jean DUPONT,");
    expect(body).not.toContain("Monsieur");
    expect(body).toContain("Je renonce à mon délai de rétractation de 14 jours");
    expect(body).toContain("Je vous remercie de démarrer votre prestation dès à présent.");
  });

  it("construit les annexes Capital investissement (§5 risques page 2, préco page 3, récap page 4)", () => {
    const preview = buildAnnexesRapportPreview(
      "capital-investissement",
      {
        conseil:
          "Je vous propose de souscrire à un FCPI afin de bénéficier d'une réduction d'impôt sur l'IR.",
        mes_preconisations:
          "Mes préconisations portent sur un investissement global de 9 975 € (montants souscrits et droits d'entrée inclus), répartis ainsi :\n\nLa souscription de parts du FCPI Odyssée au comptant pour un montant de 9 975 €, soit 105 € la part x 95 parts = montant total souscrit de 9 975 €. Dont 5 % de droit d'entrée, soit 498,75 €.",
        niveau_experience_qpi: "Expérimenté",
      },
      {
        ...defaultSouscriptionDossierFields(),
        capitalInvestAnnexeSouscriptions: [
          {
            id: "ci-test",
            nomFonds: "Odysée M2",
            type: "fcpi",
            nbParts: "95",
            partPriceEur: "105",
            droitEntreePct: "5",
            millesime: "",
            emtLine07110Pct: "",
            emtLine07130Pct: "",
            emtLine07140Pct: "",
          },
        ],
      }
    );

    expect(preview.pages).toHaveLength(8);

    const page1 = preview.pages[0]!;
    expect(page1.title).toBe(ANNEXES_RAPPORT_DOCUMENT_TITLE);
    expect(page1.centeredSectionTitle).toBe("— LE CAPITAL INVESTISSEMENT —");
    expect(page1.showAnnexesProsConsTable).toBe(true);
    expect(page1.showAmfRiskScale).toBeUndefined();
    expect(page1.bodySegmentsAfterProsConsTable).toBeUndefined();

    const page2 = preview.pages[1]!;
    expect(page2.pageNumber).toBe(2);
    expect(page2.title).toBeUndefined();
    const risques = page2.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(risques).toContain("5. Les risques");
    expect(page2.showAmfRiskScale).toBe(true);
    expect(page2.amfRiskHighlightLevel).toBe(6);
    expect(page2.amfRiskInvestmentHorizon).toBe("> 10 ans");

    const risksBody = (page2.bodySegmentsAfterTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(risksBody).toContain("L'investissement en FIP et FCPI comporte des risques");
    expect(risksBody).toContain("- Risque de perte en capital");
    expect(risksBody).toContain("- Risque fiscal");
    expect(risksBody).toContain("Le Client déclare avoir pris connaissance");

    const page3 = preview.pages[2]!;
    expect(page3.pageNumber).toBe(3);
    const preco = page3.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(preco).toContain("Mes préconisations portent sur un investissement global");
    expect(preco).toContain("du FCPI Odyssée");

    const page4 = preview.pages[3]!;
    expect(page4.pageNumber).toBe(4);
    expect(page4.rapportRecapTableHeader).toBe("TABLEAU RÉCAPITULATIF");
    expect(page4.rapportRecapRows).toHaveLength(6);
    const objectifsCell = page4.rapportRecapRows?.[1].contentSegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(objectifsCell).toContain("le FCPI Odysée M2 permet de bénéficier");
    const adaptationCell = page4.rapportRecapRows?.[0].contentSegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(adaptationCell).toContain("réduction d'impôt, tout en diversifiant");
    const dureeCell = page4.rapportRecapRows?.[2].contentSegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(dureeCell).toContain("de 7 à 10 ans minimum, selon les millésimes souscrits");
    expect(dureeCell).toContain("prorogée par la Société de gestion");
    const connaissancesCell = page4.rapportRecapRows?.[3].contentSegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(connaissancesCell).toContain("Expérimenté");
    expect(connaissancesCell).toContain("DICI");
    expect(preview.missingKeys).not.toContain("niveau_experience_qpi");
    const risqueCell = page4.rapportRecapRows?.[4].contentSegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(risqueCell).toContain("épargne de précaution");
    expect(risqueCell).toContain("part mineure du patrimoine");
    const reexamenCell = page4.rapportRecapRows?.[5].contentSegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(reexamenCell).toContain("Non.");
    expect(reexamenCell).toContain("fonds fermés");
    expect(reexamenCell).toContain("vocation fiscale");

    const costsIntro = (page4.bodySegmentsAfterRecapTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(costsIntro).toContain("Informations sur les coûts et les frais");
    expect(costsIntro).toContain("Document d'Informations Clés");
    expect(page4.showAnnexesCostsTable).toBe(true);

    const productsRow = page4.annexesCostsRows?.find((r) => r.label === "Coûts liés aux produits");
    expect(productsRow?.amount).toBe("");

    const footer = (page4.bodySegmentsAfterCostsTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(footer).toContain("ventilation plus précise");
  });

  it("calcule le tableau coûts CI avec taux EMT et quote-part CIF", () => {
    const preview = buildAnnexesRapportPreview(
      "capital-investissement",
      { conseil: "", mes_preconisations: "", niveau_experience_qpi: "Expérimenté" },
      {
        ...defaultSouscriptionDossierFields(),
        capitalInvestAnnexeSouscriptions: [
          {
            id: "ci-test",
            nomFonds: "Odysée M2",
            type: "fcpi",
            nbParts: "100",
            partPriceEur: "100",
            droitEntreePct: "5",
            millesime: "2025",
            emtLine07110Pct: "0,0066",
            emtLine07130Pct: "0,0267",
            emtLine07140Pct: "0",
          },
        ],
        quotePartPercueConsultantCifEur: "300",
      }
    );

    const page4 = preview.pages[3]!;
    const tiersRow = page4.annexesCostsRows?.find((r) => r.label.includes("Paiement reçu de tiers"));
    expect(tiersRow?.amount).toBe("300 €");
    expect(tiersRow?.percent).toBe("3,0 %");

    const productsRow = page4.annexesCostsRows?.find((r) => r.label === "Coûts liés aux produits");
    expect(productsRow?.amount).toBe("333 €");
    expect(productsRow?.percent).toBe("3,33 %");

    const totalRow = page4.annexesCostsRows?.find((r) => r.label === "TOTAL COÛTS ET FRAIS");
    expect(totalRow?.amount).toBe("633 €");
    expect(totalRow?.percent).toBe("6,33 %");
  });

  it("construit la page 5 CI (préconisations conseiller, objectifs, caractéristiques)", () => {
    const preview = buildAnnexesRapportPreview(
      "capital-investissement",
      {},
      defaultSouscriptionDossierFields()
    );

    const page5 = preview.pages[4]!;
    expect(page5.pageNumber).toBe(5);
    expect(page5.showAnnexesObjectifsPatrimoniauxTable).toBe(true);
    expect(page5.objectifsPatrimoniauxVariant).toBe("capital-invest");

    const section1 = page5.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section1).toContain("1. Préconisations du conseiller");
    expect(section1).toContain("perspective long terme");

    const rows = page5.annexesObjectifsPatrimoniauxRows ?? [];
    expect(rows.every((r) => !r.immobilier && r.placementsFinanciers)).toBe(true);

    expect(page5.showAnnexesCaracteristiquesOperationTable).toBe(true);
    const avantages = page5.annexesCaracteristiquesOperationSections?.[0];
    expect(avantages?.rows[5]?.placementsFinanciers).toEqual({ kind: "check", checked: false });

    const inconv = page5.annexesCaracteristiquesOperationSections?.[1];
    expect(inconv?.rows[0].placementsFinanciers).toMatchObject({
      kind: "text",
      value: expect.stringContaining("sociétés de gestion"),
    });
    expect(page5.showAnnexesHorizonProfilTable).toBe(true);
    expect(page5.annexesHorizonProfilRows?.[2].horizon).toMatchObject({
      label: "de 7 à 10 ans",
      checked: true,
    });
  });

  it("construit les pages 6–8 CI (origine des fonds, signatures et renonciation)", () => {
    const preview = buildAnnexesRapportPreview(
      "capital-investissement",
      {
        cgp_formule_politesse: "Monsieur,",
        client_ville: "Paris",
        date_document: "22/06/2025",
        cgp_nom_complet: "MARTIN Pierre",
        client_nom_prenom: "BERNARD Luc",
      },
      {
        ...defaultSouscriptionDossierFields(),
        provenanceFonds: "metropole",
        origineFondsSelected: ["epargne_courante"],
      }
    );

    expect(preview.pages).toHaveLength(8);

    const page6 = preview.pages[5]!;
    expect(page6.showAnnexesOrigineFondsSection).toBe(true);
    const intro = page6.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(intro).toContain("5. Déclaration sur l'honneur");
    expect(intro).toContain("R.561-38");
    expect(page6.annexesOrigineFondsView?.provenanceFonds).toBe("metropole");

    const section6 = page6.bodySegmentsSection6Intro
      ?.map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section6).toContain("6. Informations");
    expect(page6.bodySegmentsSection7).toBeUndefined();
    expect(page6.bodySegmentsAfterSection7).toBeUndefined();
    expect(page6.signatureColumns).toBeUndefined();

    const page7 = preview.pages[6]!;
    const section7 = page7.bodySegmentsSection7
      ?.map((s) =>
        s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""
      )
      .join("");
    expect(section7).toContain("7. Notes importantes");

    const faitA = page7.bodySegmentsAfterSection7
      ?.map((s) =>
        s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""
      )
      .join("");
    expect(faitA).toBe("Fait à Paris, le 22/06/2025.");

    expect(page7.signatureColumns?.left?.[0]?.[0]).toMatchObject({
      kind: "text",
      value: "Signature du conseiller :",
    });
    expect(page7.signatureColumns?.right?.[0]?.[0]).toMatchObject({
      kind: "text",
      value: "Signature du client :",
    });
    expect(page7.signatureColumns?.right?.[2]?.[0]).toMatchObject({
      kind: "text",
      value: expect.stringContaining("exactitude des renseignements"),
    });

    const page8 = preview.pages[7]!;
    const renonciation = page8.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(renonciation).toContain("Renonciation au délai de rétractation");
  });

  it("construit la page 1 G3F avec conseil, titre Girardin et sections 1 à 4", () => {
    const preview = buildAnnexesRapportPreview(
      "g3f",
      {
        conseil:
          "Afin de répondre à vos objectifs, je vous conseille de souscrire en Girardin industriel.",
        g3f_rendement: "11 %",
      },
      defaultSouscriptionDossierFields()
    );

    expect(preview.pages).toHaveLength(2);
    const page = preview.pages[0]!;
    expect(page.title).toBe(ANNEXES_RAPPORT_DOCUMENT_TITLE);
    expect(page.centeredSectionTitle).toBe("— Girardin Industriel —");

    const intro = page.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(intro).toContain("Girardin industriel");

    const body = (page.bodySegmentsContinuation ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`))
      .join("");
    expect(body).toContain("1. Caractéristiques de l'investissement en Girardin industriel");
    expect(body).toContain("Société en Nom Commercial (SNC)");
    expect(body).toContain("Outre-Mer");
    expect(body).toContain("2. Mécanisme de la réduction d'impôt");
    expect(body).toContain("3. La rentabilité");
    expect(body).toContain("montant investi + 11 %");
    expect(body).toContain("4. Le schéma du montage");
    expect(body).toContain("DOM-COM");
    expect(page.showG3fMontageDiagram).toBe(true);

    const section5 = (page.bodySegmentsAfterG3fMontageDiagram ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section5).toContain("5. Les risques du Girardin industriel");
    expect(section5).toContain("Les risques du produit Girardin industriel sont les suivants");
    expect(section5).toContain("ne percevront aucun dividende");
    expect(section5).toContain("Code général des impôts (CGI)");
    expect(section5).toContain("- Risques locatifs :");
    expect(section5).toContain("- Risques bancaires :");
    expect(section5).toContain("- Autres risques :");
    expect(section5).not.toContain("✓ RISQUES LOCATIFS");
    expect(section5).toContain("- Nature de l'activité de l'exploitant :");
    expect(section5).toContain("- Diminution du montant de l'apport souhaité :");
    expect(section5).toContain("Assistance administrative");
    expect(section5).toContain("Couverture financière G3F");
    expect(section5).toContain("assistance administrative au titre de cet investissement");

    expect(section5).toContain("Cadre réservé au client");
    expect(section5).toContain("article L.341-1 du CMF");
    expect(section5).toContain("Calcul de l'investissement");
    expect(section5).toContain("Calcul du montant d'apport nécessaire");
    expect(section5).toContain("Recalcul du plafond");
    expect(section5).toContain("opérations en LODEOM");
    expect(section5).toContain("créance sur l'État");
    expect(section5).not.toContain("opération opérations");
    expect(section5).not.toContain("Loi Lodeom");

    const pageRecap = preview.pages[1]!;
    expect(pageRecap.bodySegments).toHaveLength(0);
    expect(pageRecap.rapportRecapTableHeader).toBe("TABLEAU RÉCAPITULATIF");
    expect(pageRecap.rapportRecapRows).toHaveLength(6);
    const recapTitles = pageRecap.rapportRecapRows?.map((r) => r.title) ?? [];
    expect(recapTitles[0]).toContain("adaptée au client");
    expect(recapTitles[5]).toContain("réexamen périodique");
    const recapObjectifs = pageRecap.rapportRecapRows?.[1].contentSegments
      .map((s) => (s.kind === "text" ? s.value : ""))
      .join("");
    expect(recapObjectifs).toContain("réduction d'impôt immédiate");
    const recapReexamen = pageRecap.rapportRecapRows?.[5].contentSegments
      .map((s) => (s.kind === "text" ? s.value : ""))
      .join("");
    expect(recapReexamen).toContain("conservation des parts pendant 5 ans");
    expect(page.rapportRecapRows).toBeUndefined();

    const section5Blocks = buildCifProseBlocks(
      renderTemplateSegments(ANNEXES_G3F_SECTION5_BODY, {})
    );
    const section6Blocks = buildCifProseBlocks(
      renderTemplateSegments(ANNEXES_G3F_SECTION6_BODY, {})
    );
    expect(ANNEXES_G3F_SECTION5_BODY).not.toMatch(/\n{3,}/);
    expect(ANNEXES_G3F_SECTION6_BODY).not.toMatch(/\n{3,}/);
    expect(section5Blocks.filter((b) => b.kind === "blank").length).toBeLessThan(20);
    expect(section6Blocks.filter((b) => b.kind === "blank").length).toBeLessThan(15);
    expect(preview.missingKeys).not.toContain("g3f_rendement");
  });

  it("enchaîne récap et préconisations/objectifs sur la page 2 G3F (sans saut logique)", () => {
    const preview = buildAnnexesRapportPreview(
      "g3f",
      { g3f_rendement: "11 %", conseil: "Conseil." },
      defaultSouscriptionDossierFields()
    );

    expect(preview.pages).toHaveLength(2);
    const pageRecap = preview.pages[1]!;
    expect(pageRecap.rapportRecapTableHeader).toBe("TABLEAU RÉCAPITULATIF");
    expect(pageRecap.showAnnexesObjectifsPatrimoniauxTable).toBe(true);
    expect(pageRecap.objectifsPatrimoniauxVariant).toBe("g3f");

    const section1 = (pageRecap.bodySegmentsAfterRecapTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section1).toContain("1. Préconisations du conseiller");
    expect(section1).toContain("perspective moyen terme");

    const rows = pageRecap.annexesObjectifsPatrimoniauxRows ?? [];
    expect(rows).toHaveLength(5);
    expect(rows[0]?.placementsFinanciers).toBe(true);
    expect(rows[4]?.label).toContain("Optimisation fiscale");

    expect(pageRecap.showAnnexesCaracteristiquesOperationTable).toBe(true);
    const avantages = pageRecap.annexesCaracteristiquesOperationSections?.[0];
    expect(avantages?.rows[3]?.placementsFinanciers).toEqual({ kind: "check", checked: true });
    expect(avantages?.rows[6]?.placementsFinanciers).toEqual({ kind: "check", checked: true });

    const inconv = pageRecap.annexesCaracteristiquesOperationSections?.[1];
    expect(inconv?.rows[0].placementsFinanciers).toEqual({
      kind: "text",
      value: "Voir détail en annexe",
      rowSpan: 3,
    });
    expect(pageRecap.showAnnexesHorizonProfilTable).toBe(true);
    expect(pageRecap.annexesHorizonProfilRows?.[1]?.horizon).toMatchObject({
      label: "de 3 à 8 ans",
      checked: true,
    });
  });

  it("enchaîne origine des fonds, notes et signatures sur la page 2 G3F (sans saut logique)", () => {
    const preview = buildAnnexesRapportPreview(
      "g3f",
      {
        g3f_rendement: "11 %",
        conseil: "Conseil.",
        client_ville: "Montpellier",
        date_document: "22/06/2025",
        client_nom_prenom: "BERNARD Luc",
        cgp_nom_complet: "DUPONT Jean",
      },
      {
        ...defaultSouscriptionDossierFields(),
        provenanceFonds: "metropole",
        origineFondsSelected: ["epargne_courante"],
      },
      undefined,
      2
    );

    expect(preview.pages).toHaveLength(2);
    const pageSuite = preview.pages[1]!;
    expect(pageSuite.showAnnexesOrigineFondsSection).toBe(true);
    expect(pageSuite.annexesOrigineFondsView?.provenanceFonds).toBe("metropole");
    const intro5 = (pageSuite.bodySegmentsAfterHorizonProfilTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(intro5).toContain("5. Déclaration sur l'honneur de l'origine des fonds");
    const section6 = (pageSuite.bodySegmentsSection6Intro ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section6).toContain("6. Informations");
    expect(section6).toContain("☒ Oui");

    const section7 = (pageSuite.bodySegmentsSection7 ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(section7).toContain("7. Notes importantes");
    expect(section7).not.toContain("Le CIF déclare");
    const faitA = (pageSuite.bodySegmentsAfterSection7 ?? [])
      .map((s) => (s.kind === "text" ? s.value : ""))
      .join("");
    expect(faitA).toContain("Montpellier");
    expect(
      pageSuite.signatureColumns?.right
        .flat()
        .map((s) => (s.kind === "text" ? s.value : ""))
        .join("")
    ).toContain("Signature des clients");
    expect(preview.missingKeys).not.toContain("provenance_fonds");
  });

  it("signale provenance et origine manquantes (G3F)", () => {
    const preview = buildAnnexesRapportPreview(
      "g3f",
      { conseil: "Conseil.", g3f_rendement: "11 %" },
      defaultSouscriptionDossierFields()
    );
    expect(preview.missingKeys).toEqual(
      expect.arrayContaining(["provenance_fonds", "origine_fonds"])
    );
  });

  it("signale le rendement G3F manquant", () => {
    const preview = buildAnnexesRapportPreview("g3f", { conseil: "Conseil test." }, defaultSouscriptionDossierFields());
    expect(preview.missingKeys).toContain("g3f_rendement");
  });

  it("signale les champs calcul G3F manquants", () => {
    const preview = buildAnnexesRapportPreview(
      "g3f",
      {
        conseil: "Conseil test.",
        g3f_rendement: "11 %",
        cgp_nom_complet: "Jean DUPONT",
      },
      defaultSouscriptionDossierFields()
    );
    expect(preview.missingKeys).toEqual(
      expect.arrayContaining([
        "g3f_annee_impot",
        "g3f_montant_impot",
        "g3f_montant_reduction_souhaitee",
        "g3f_montant_apport",
        "g3f_frais_enregistrement",
        "g3f_total_apport",
        "g3f_annee_loi_finances",
      ])
    );
  });

  it("intègre les montants G3F saisis dans le calcul d'apport", () => {
    const dossier = {
      ...defaultSouscriptionDossierFields(),
      g3fAnneeImpot: "2025",
      g3fMontantImpotEur: "25000",
      g3fReductionSouhaiteeEur: "15000",
      g3fMontantApportEur: "12000",
      g3fFraisEnregistrementEur: "300",
      g3fAnneeLoiFinances: "2025",
      g3fAnneeSouscription: "2025",
      g3fAnneeDeclarationRevenus: "2027",
    };
    const preview = buildAnnexesRapportPreview(
      "g3f",
      {
        conseil: "Conseil test.",
        g3f_rendement: "11 %",
        cgp_nom_complet: "Jean DUPONT",
        g3f_annee_impot: "2025",
        g3f_montant_impot: "25 000",
        g3f_montant_reduction_souhaitee: "15 000",
        g3f_montant_apport: "12 000",
        g3f_frais_enregistrement: "300",
        g3f_total_apport: "12 300",
        g3f_annee_loi_finances: "2025",
        g3f_annee_souscription: "2025",
        g3f_annee_declaration_revenus: "2027",
      },
      dossier
    );
    const afterMontage = (preview.pages[0]!.bodySegmentsAfterG3fMontageDiagram ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : ""))
      .join("");
    expect(afterMontage).toContain("Jean DUPONT");
    expect(afterMontage).toContain("impôt sur le revenu 2025 à 25 000 €");
    expect(afterMontage).toContain("Montant de l'apport nécessaire : 12 000 €");
    expect(afterMontage).toContain("Total de l'apport : environ 12 300 €");
    expect(afterMontage).toContain("avril/mai 2027");
    expect(afterMontage).toContain("restituées à l'été 2027");
    expect(preview.missingKeys).not.toContain("g3f_montant_apport");
  });
});
