import { describe, expect, it } from "vitest";
import {
  CRM_A_COTE_COLOR,
  CRM_IMMOBILIER_COLOR,
  CRM_PLACEMENT_COLOR,
  CRM_SCPI_COLOR,
  getClientPreviewInvestissementColor,
} from "./patrimoine-palette";

import {
  CRM_IMMOBILIER_COLOR,
  CRM_SCPI_COLOR,
  getPatrimoineTimelineEventColor,
} from "./patrimoine-palette";

describe("getPatrimoineTimelineEventColor", () => {
  it("aligne sur la couleur du placement lié", () => {
    expect(
      getPatrimoineTimelineEventColor({
        kind: "fin_pret",
        type_produit: "PINEL",
        origine: "MON_CONSEIL",
      })
    ).toBe(CRM_IMMOBILIER_COLOR);
    expect(
      getPatrimoineTimelineEventColor({
        kind: "fin_demembrement",
        type_produit: "SCPI",
        origine: "MON_CONSEIL",
      })
    ).toBe(CRM_SCPI_COLOR);
  });
});

describe("getClientPreviewInvestissementColor", () => {
  it("aligne sur les couleurs CRM — vert immo, bleu ardoise SCPI, rose placements", () => {
    expect(
      getClientPreviewInvestissementColor("LMNP", "MON_CONSEIL")
    ).toBe(CRM_IMMOBILIER_COLOR);
    expect(getClientPreviewInvestissementColor("SCPI", "MON_CONSEIL")).toBe(
      CRM_SCPI_COLOR
    );
    expect(
      getClientPreviewInvestissementColor("ASSURANCE_VIE", "MON_CONSEIL")
    ).toBe(CRM_PLACEMENT_COLOR);
  });

  it("gris pour le patrimoine à côté", () => {
    expect(
      getClientPreviewInvestissementColor("SCPI", "EXISTANT_CLIENT")
    ).toBe(CRM_A_COTE_COLOR);
    expect(
      getClientPreviewInvestissementColor("ASSURANCE_VIE", "DECLARE_CLIENT")
    ).toBe(CRM_A_COTE_COLOR);
  });
});
