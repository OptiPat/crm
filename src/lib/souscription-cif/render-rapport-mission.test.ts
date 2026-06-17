import { describe, expect, it } from "vitest";
import { buildRapportMissionPreview } from "@/lib/souscription-cif/render-rapport-mission";
import { RM_DOCUMENT_TITLE } from "@/lib/souscription-cif/rapport-mission-page1";
import {
  RM_PAGE2_ROW_MISSIONS_TITLE,
  RM_PAGE2_ROW_QUESTIONS_TITLE,
} from "@/lib/souscription-cif/rapport-mission-page2";
import {
  RM_RECAP_ROW_DEMANDE_TITLE,
  RM_RECAP_ROW_SITUATION_TITLE,
} from "@/lib/souscription-cif/rapport-mission-recap-table";

const baseVariables = {
  client_nom_prenom: "Luc BERNARD",
  client_adresse: "12 rue Example",
  client_cp_ville: "34000 Montpellier",
  client_ville: "Montpellier",
  client_telephone: "06 12 34 56 78",
  client_date_naissance: "01/01/1980",
  client_lieu_naissance: "Montpellier",
  date_document: "14/06/2026",
  cgp_nom_complet: "Jean DUPONT",
  cgp_rcs_ville: "Montpellier",
  cgp_siren: "843 139 148",
  cgp_adresse_ligne: "4 impasse des arbousiers",
  cgp_cp_ville: "34660 Cournonsec",
  cgp_anacofi_numero: "E011507",
  cgp_orias: "19000736",
  cgp_siren_compact: "843139148",
  rappel_demande: "Diversification patrimoniale",
  rappel_situation_client: "➞ Âge : 45 ans\n➞ Situation matrimoniale : Marié(e)",
};

function segmentText(
  segments: { kind: string; value?: string; label?: string }[] | undefined
): string {
  return (segments ?? [])
    .map((s) =>
      s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`
    )
    .join("");
}

describe("buildRapportMissionPreview", () => {
  it("construit la page 1 avec en-tête client, titre et identification seulement", () => {
    const preview = buildRapportMissionPreview(baseVariables);

    expect(preview.pages).toHaveLength(3);
    const page = preview.pages[0]!;
    expect(page.title).toBe(RM_DOCUMENT_TITLE);
    expect(page.pageNumber).toBe(1);
    expect(page.rapportRecapRows).toBeUndefined();

    const headerLeft = (page.headerLeft ?? []).flat().map((s) =>
      s.kind === "text" || s.kind === "underline" || s.kind === "bold" ? s.value : `[${s.label}]`
    );
    expect(headerLeft.join("")).toContain("Luc BERNARD");

    const body = segmentText(page.bodySegments);
    expect(body).toContain("Identification des intervenants");
    expect(body).toContain("Jean DUPONT");
    expect(body).toContain("Ci-après désigné « le Conseiller »");
  });

  it("construit la page 2 avec demande, situation, questions et missions", () => {
    const preview = buildRapportMissionPreview(baseVariables);
    const page2 = preview.pages[1]!;

    expect(page2.pageNumber).toBe(2);
    expect(page2.rapportRecapRows).toHaveLength(4);
    expect(page2.rapportRecapRows?.map((r) => r.title)).toEqual([
      RM_RECAP_ROW_DEMANDE_TITLE,
      RM_RECAP_ROW_SITUATION_TITLE,
      RM_PAGE2_ROW_QUESTIONS_TITLE,
      RM_PAGE2_ROW_MISSIONS_TITLE,
    ]);

    const demandeText = segmentText(page2.rapportRecapRows?.[0]?.contentSegments);
    expect(demandeText).toContain("Diversification patrimoniale");

    const situationText = segmentText(page2.rapportRecapRows?.[1]?.contentSegments);
    expect(situationText).toContain("Recueil d'Information");
    expect(situationText).toContain("Marié(e)");

    const missionsText = segmentText(
      page2.rapportRecapRows?.find((r) => r.title === RM_PAGE2_ROW_MISSIONS_TITLE)?.contentSegments
    );
    expect(missionsText).toContain("Stellium Invest");
  });

  it("construit la page 3 avec rappels, fait à et signatures", () => {
    const preview = buildRapportMissionPreview({
      ...baseVariables,
      objectifs_client: "Constituer un patrimoine diversifié",
      date_rio: "01/03/2026",
      analyse_situation_client:
        "Vous souhaitez vous reconvertir professionnellement dans les trois prochaines années. Les SCPI de rendement permettent de constituer un revenu complémentaire régulier pendant cette transition.",
    });

    const page3 = preview.pages[2]!;
    expect(page3.pageNumber).toBe(3);
    expect(page3.rapportRecapRows).toHaveLength(7);

    const objectifsText = segmentText(
      page3.rapportRecapRows?.find((r) => r.title === "RAPPEL DES OBJECTIFS")?.contentSegments
    );
    expect(objectifsText).toContain("Constituer un patrimoine diversifié");

    const analyseText = segmentText(
      page3.rapportRecapRows?.find((r) => r.title === "ANALYSE DE LA SITUATION")?.contentSegments
    );
    expect(analyseText).toContain("01/03/2026");
    expect(analyseText).toContain("étude patrimoniale");
    expect(analyseText).toContain(
      "Vous souhaitez vous reconvertir professionnellement dans les trois prochaines années"
    );

    const noQuestions = "Pas de questions particulières de la part du Client.";
    for (const title of [
      "QUESTIONS RELATIVES À L'ANALYSE ET QUESTIONS COMPLÉMENTAIRES",
    ]) {
      const row = page3.rapportRecapRows?.find((r) => r.title === title);
      expect(segmentText(row?.contentSegments)).toContain(noQuestions);
    }

    const faitA = segmentText(page3.bodySegmentsAfterRecapTable);
    expect(faitA).toContain("Montpellier");
    expect(faitA).toContain("14/06/2026");

    const sigLeft = (page3.signatureColumns?.left ?? [])
      .map((line) => segmentText(line))
      .join("\n");
    const sigRight = (page3.signatureColumns?.right ?? [])
      .map((line) => segmentText(line))
      .join("\n");
    expect(sigLeft).toContain("Signature du conseiller");
    expect(sigLeft).toContain("Lu et Approuvé");
    expect(sigLeft).toContain("Jean DUPONT");
    expect(sigRight).toContain("Signature du client");
    expect(sigRight).toContain("rapport de mission et déclaration d'adéquation");
    expect(sigRight).toContain("Luc BERNARD");
  });
});
