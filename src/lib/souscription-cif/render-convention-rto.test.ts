import { describe, expect, it } from "vitest";
import { buildConventionRtoPreview } from "@/lib/souscription-cif/render-convention-rto";
import type { ScpiLmPagePreview } from "@/lib/souscription-cif/render-template";
import { RTO_DOCUMENT_TITLE } from "@/lib/souscription-cif/rto-page1";

describe("buildConventionRtoPreview", () => {
  const baseVariables = {
    client_nom_prenom: "Luc ALAMEDA",
    client_date_naissance: "12/03/1975",
    client_lieu_naissance: "Montpellier",
    client_adresse: "12 rue des Oliviers",
    client_cp_ville: "34000 Montpellier",
    client_ville: "Montpellier",
    date_document: "13/06/2026",
    cgp_nom_complet: "Nicolas PLAZA",
    cgp_adresse_ligne: "4 impasse des arbousiers",
    cgp_cp_ville: "34660 Cournonsec",
    cgp_rcs_ville: "Montpellier",
    cgp_siren: "843 139 148",
    cgp_siren_compact: "843139148",
    cgp_orias: "19000736",
    cgp_anacofi_numero: "E011507",
    cgp_representant_legal: "Nicolas PLAZA en qualité de gérant",
  };

  function pageText(page: ScpiLmPagePreview) {
    return page.bodySegments
      .map((s) =>
        s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`
      )
      .join("");
  }

  it("construit la page 1 avec titres, identification et préambule", () => {
    const preview = buildConventionRtoPreview(baseVariables);

    expect(preview.pages).toHaveLength(6);
    const page = preview.pages[0];
    expect(page.title).toBe(RTO_DOCUMENT_TITLE);
    expect(page.centeredPreambleTitle).toBe("— PRÉAMBULE —");
    expect(page.centeredSectionTitle).toBeUndefined();

    const headerLeft = (page.headerLeft ?? [])
      .map((line) => line.map((s) => (s.kind === "text" ? s.value : "")).join(""))
      .join("\n");
    expect(headerLeft).toContain("Luc ALAMEDA");

    const body = pageText(page);
    expect(body).toContain("Identification des intervenants");
    expect(body).toContain("La société Nicolas PLAZA");
    expect(body).toContain("ayant son siège social au 4 impasse des arbousiers");
    expect(body).toContain("immatriculée au Registre du Commerce");
    expect(body).toContain("ORIAS sous le n°19000736");
    expect(body).toContain("Nicolas PLAZA en qualité de gérant.");
    expect(body).toContain("Ci-après désigné « le Conseiller ».");
    expect(body).toContain("Ensemble, « les Parties ».");
    expect(body).not.toContain("PRÉAMBULE");

    const continuation = (page.bodySegmentsContinuation ?? [])
      .map((s) =>
        s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`
      )
      .join("");
    expect(continuation).toContain("Article 1 – Définitions");
    expect(preview.missingKeys).toHaveLength(0);
  });

  it("construit la page 2 avec définitions, articles 2 et 3", () => {
    const preview = buildConventionRtoPreview(baseVariables);
    const page2 = preview.pages[1];
    expect(page2.pageNumber).toBe(2);
    expect(page2.title).toBeUndefined();

    const body = pageText(page2);
    expect(body).toContain("Conseil en investissement");
    expect(body).toContain("désigne le fait de fournir");
    expect(body).toContain("Convention");
    expect(body).toContain("désigne la présente Convention");
    expect(body).toContain("RTO");
    expect(body).toContain("réception-transmission d'Ordres");
    expect(body).toContain("Article 2 – Objet");
    expect(body).toContain("Article 3 – Fourniture du service de RTO");
    expect(body).toContain("3.1 Modalités de transmission des Ordres");
    expect(body).toContain("au format PDF.");
  });

  it("construit la page 3 avec suite article 3 (§3.2, §3.3)", () => {
    const preview = buildConventionRtoPreview(baseVariables);
    const page3 = preview.pages[2];
    expect(page3.pageNumber).toBe(3);

    const body = pageText(page3);
    expect(body).toContain("Tout Ordre verbal doit faire l'objet");
    expect(body).toContain("3.2 Contenu des Ordres");
    expect(body).toContain("L'identité du Client");
    expect(body).toContain("3.3 Conditions de réception et de prise en charge des Ordres");
    expect(body).toContain("deux (2) jours ouvrés");
  });

  it("construit la page 4 avec suite article 3, articles 4 et 5", () => {
    const preview = buildConventionRtoPreview(baseVariables);
    const page4 = preview.pages[3];
    expect(page4.pageNumber).toBe(4);

    const body = pageText(page4);
    expect(body).toContain("Les Ordres réceptionnés par le Conseiller");
    expect(body).toContain("Article 4 – Engagements et déclarations du Conseiller");
    expect(body).toContain("4.2 Le Conseiller n'est tenu");
    expect(body).toContain("force majeure");
    expect(body).toContain("Article 5 – Engagements et déclarations du Client");
    expect(body).toContain("5.3 Le Client s'engage");
  });

  it("construit la page 5 avec suite article 5 et articles 6 à 9", () => {
    const preview = buildConventionRtoPreview(baseVariables);
    const page5 = preview.pages[4];
    expect(page5.pageNumber).toBe(5);

    const body = pageText(page5);
    expect(body).toContain("5.4 Le Client reconnaît");
    expect(body).toContain("5.5 Le Client s'engage à indemniser");
    expect(body).toContain("Article 6 – Rémunération du Conseiller");
    expect(body).toContain("Article 7 – Enregistrement et traçabilité");
    expect(body).toContain("Article 8 – Entrée en vigueur");
    expect(body).toContain("8.4 En outre");
    expect(body).toContain("Article 9 – Traitement des réclamations");
    expect(body).toContain("9.2 Le Conseiller s'engage");
  });

  it("construit la page 6 avec articles 10 à 12 et signatures", () => {
    const preview = buildConventionRtoPreview(baseVariables);
    const page6 = preview.pages[5];
    expect(page6.pageNumber).toBe(6);

    const body = pageText(page6);
    expect(body).toContain("Article 10 – Traitement des données personnelles");
    expect(body).toContain("Article 11 – Réclamations Client");
    expect(body).toContain("Article 12 – Droit applicable");

    const faitA = (page6.bodySegmentsAfterTable ?? [])
      .map((s) =>
        s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`
      )
      .join("");
    expect(faitA).toContain("Fait à Montpellier");
    expect(faitA).toContain("deux exemplaires originaux");

    const sigLeft = (page6.signatureColumns?.left ?? [])
      .map((line) => line.map((s) => (s.kind === "text" ? s.value : "")).join(""))
      .join("\n");
    const sigRight = (page6.signatureColumns?.right ?? [])
      .map((line) => line.map((s) => (s.kind === "text" ? s.value : "")).join(""))
      .join("\n");
    expect(sigLeft).toContain("Le Conseiller Nicolas PLAZA");
    expect(sigLeft).toContain("Titre : Gérant");
    expect(sigRight).toContain("Le Client Luc ALAMEDA");
    expect(sigRight).toContain("Titre : Client");
  });
});
