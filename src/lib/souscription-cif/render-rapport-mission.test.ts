import { describe, expect, it } from "vitest";
import { buildRapportMissionPreview } from "@/lib/souscription-cif/render-rapport-mission";
import { RM_DOCUMENT_TITLE } from "@/lib/souscription-cif/rapport-mission-page1";

describe("buildRapportMissionPreview", () => {
  it("construit la page 1 avec en-tête client, titre et identification", () => {
    const preview = buildRapportMissionPreview({
      client_nom_prenom: "Luc ALAMEDA",
      client_adresse: "12 rue Example",
      client_cp_ville: "34000 Montpellier",
      client_ville: "Montpellier",
      client_telephone: "06 12 34 56 78",
      client_date_naissance: "01/01/1980",
      client_lieu_naissance: "Montpellier",
      date_document: "14/06/2026",
      cgp_nom_complet: "Nicolas PLAZA",
      cgp_rcs_ville: "Montpellier",
      cgp_siren: "843 139 148",
      cgp_adresse_ligne: "4 impasse des arbousiers",
      cgp_cp_ville: "34660 Cournonsec",
      cgp_anacofi_numero: "E011507",
      cgp_orias: "19000736",
      cgp_siren_compact: "843139148",
      rappel_demande: "Diversification patrimoniale",
      rappel_situation_client: "➞ Âge : 45 ans\n➞ Situation matrimoniale : Marié(e)",
    });

    expect(preview.pages).toHaveLength(2);
    const page = preview.pages[0];
    expect(page.title).toBe(RM_DOCUMENT_TITLE);
    expect(page.pageNumber).toBe(1);

    const headerLeft = (page.headerLeft ?? []).flat().map((s) =>
      s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`
    );
    expect(headerLeft.join("")).toContain("Luc ALAMEDA");

    const body = page.bodySegments
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(body).toContain("Identification des intervenants");
    expect(body).toContain("Nicolas PLAZA");
    expect(body).toContain("Ci-après désigné « Le Conseiller »");

    expect(preview.pages[0].rapportRecapRows).toHaveLength(2);
    const demandeRow = preview.pages[0].rapportRecapRows?.[0].contentSegments ?? [];
    const demandeText = demandeRow
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(demandeText).toContain("Diversification patrimoniale");

    const situationRow = preview.pages[0].rapportRecapRows?.[1].contentSegments ?? [];
    const situationText = situationRow
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(situationText).toContain("Recueil d'information");
    expect(situationText).toContain("Marié(e)");
  });

  it("construit la page 2 avec rappels et variables", () => {
    const preview = buildRapportMissionPreview({
      objectifs_client: "Constituer un patrimoine diversifié",
      date_rio: "01/03/2026",
      client_ville: "Montpellier",
      date_document: "14/06/2026",
      cgp_nom_complet: "Nicolas PLAZA",
      client_nom_prenom: "Luc ALAMEDA",
    });

    const page2 = preview.pages[1];
    expect(page2.pageNumber).toBe(2);
    expect(page2.rapportRecapRows).toHaveLength(9);

    const missionsRow = page2.rapportRecapRows?.find(
      (r) => r.title === "RAPPEL DES MISSIONS CONFIÉES"
    );
    const missionsText = (missionsRow?.contentSegments ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(missionsText).toContain("Stellium Invest");

    const objectifsRow = page2.rapportRecapRows?.find((r) => r.title === "RAPPEL DES OBJECTIFS");
    const objectifsText = (objectifsRow?.contentSegments ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(objectifsText).toContain("Constituer un patrimoine diversifié");

    const analyseRow = page2.rapportRecapRows?.find((r) => r.title === "ANALYSE DE LA SITUATION");
    const analyseText = (analyseRow?.contentSegments ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(analyseText).toContain("01/03/2026");

    const noQuestions = "Pas de questions particulières de la part du Client.";
    for (const title of [
      "RAPPEL DES QUESTIONS POSÉES",
      "QUESTIONS RELATIVES À L'ANALYSE ET QUESTIONS COMPLÉMENTAIRES",
    ]) {
      const row = page2.rapportRecapRows?.find((r) => r.title === title);
      const text = (row?.contentSegments ?? [])
        .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
        .join("");
      expect(text).toContain(noQuestions);
    }

    const faitA = (page2.bodySegmentsAfterTable ?? [])
      .map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`))
      .join("");
    expect(faitA).toContain("Montpellier");
    expect(faitA).toContain("14/06/2026");

    const sigLeft = (page2.signatureColumns?.left ?? [])
      .map((line) =>
        line.map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`)).join("")
      )
      .join("\n");
    const sigRight = (page2.signatureColumns?.right ?? [])
      .map((line) =>
        line.map((s) => (s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`)).join("")
      )
      .join("\n");
    expect(sigLeft).toContain("Signature du conseiller");
    expect(sigLeft).toContain("Lu et Approuvé");
    expect(sigLeft).toContain("Nicolas PLAZA");
    expect(sigRight).toContain("Signature du client");
    expect(sigRight).toContain("rapport de mission et déclaration d'adéquation");
    expect(sigRight).toContain("Luc ALAMEDA");
  });
});
