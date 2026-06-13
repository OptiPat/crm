import { describe, expect, it } from "vitest";
import {
  buildScpiLettreMissionPage1Preview,
  buildScpiLettreMissionPreview,
  renderTemplateSegments,
  type SouscriptionPreviewSegment,
} from "@/lib/souscription-cif/render-template";

function segText(s: SouscriptionPreviewSegment): string {
  return s.kind === "text" || s.kind === "underline" ? s.value : `[${s.label}]`;
}

describe("buildScpiLettreMissionPreview", () => {
  it("remplit les variables connues et signale les manquantes sur les trois pages", () => {
    const preview = buildScpiLettreMissionPreview({
      client_nom_prenom: "Jean Dupont",
      client_ville: "Montpellier",
      date_document: "13/06/2026",
      date_der: null,
      date_rio: "10/01/2026",
      date_qpi: null,
      objectifs_client: "Optimiser la rentabilité de l'épargne",
      cgp_nom_complet: "Nicolas PLAZA",
      cgp_anacofi_numero: "E011507",
    });

    expect(preview.pages).toHaveLength(5);

    const page1Text = [
      ...(preview.pages[0].headerLeft ?? []).flat(),
      ...(preview.pages[0].headerRight ?? []),
      ...preview.pages[0].bodySegments,
    ]
      .map(segText)
      .join("");
    expect(page1Text).toContain("Jean Dupont");
    expect(page1Text).toContain("13/06/2026");
    expect(page1Text).toContain("Nicolas PLAZA");

    const page2Text = preview.pages[1].bodySegments.map(segText).join("");
    expect(page2Text).toContain("Optimiser la rentabilité de l'épargne");
    expect(page2Text).toContain("10/01/2026");
    expect(page2Text).toContain("1. Objet");
    expect(page2Text).toContain("3. Déclaration d'adéquation");
    expect(page2Text).not.toContain("4. Informations sur les coûts");

    const page2Underline = preview.pages[1].bodySegments.filter((s) => s.kind === "underline");
    expect(page2Underline.map((s) => (s.kind === "underline" ? s.value : ""))).toContain("1. Objet");

    const page3Text = preview.pages[2].bodySegments.map(segText).join("");
    expect(page3Text).toContain("4. Informations sur les coûts et frais");
    expect(page3Text).not.toContain("5. Information sur les stratégies");

    const page4Text = preview.pages[3].bodySegments.map(segText).join("");
    expect(page4Text).toContain("5. Information sur les stratégies");
    expect(preview.pages[3].showInstrumentsTable).toBe(true);

    const page4AfterTable = (preview.pages[3].bodySegmentsAfterTable ?? []).map(segText).join("");
    expect(page4AfterTable).toContain("6. Engagements du Conseiller");
    expect(page4AfterTable).toContain("6.1 Engagements du Conseiller");
    expect(page4AfterTable).toContain("article 325-5");

    const page5Text = preview.pages[4].bodySegments.map(segText).join("");
    expect(page5Text).toContain("6.2 Ressources humaines");
    expect(page5Text).toContain("6.3 Confidentialité");
    expect(page5Text).toContain("7. Engagements du Client");
    expect(page5Text).toContain("8. Rémunération du Conseiller");
    expect(page5Text).toContain("9. Obligations à la charge des Parties");
    expect(page5Text).toContain("0 € HT");

    expect(preview.missingKeys).toContain("date_der");
    expect(preview.missingKeys).toContain("date_qpi");
  });
});

describe("renderTemplateSegments", () => {
  it("interprète [u]…[/u] comme segment souligné", () => {
    const segments = renderTemplateSegments("[u]1. Objet[/u]\n\nTexte.", {});
    expect(segments).toEqual([
      { kind: "underline", value: "1. Objet" },
      { kind: "text", value: "\n\nTexte." },
    ]);
  });
});

describe("buildScpiLettreMissionPage1Preview", () => {
  it("expose missingKeys pour compatibilité", () => {
    const preview = buildScpiLettreMissionPage1Preview({
      client_nom_prenom: "Jean Dupont",
      date_document: "13/06/2026",
      date_der: null,
    });

    expect(preview.pageNumber).toBe(1);
    expect(preview.missingKeys).toContain("date_der");
  });
});
