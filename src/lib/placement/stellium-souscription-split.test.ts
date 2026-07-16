import { describe, expect, it } from "vitest";
import {
  placementOperationMatchesConformeTrigger,
  findPlacementConformeTemplatesForOperation,
} from "@/lib/emails/template-email-placement-conforme";
import {
  AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
  placementStelliumLabelMatchesEmailTrigger,
  SCPI_STELLIUM_SOUSCRIPTION_LABEL,
} from "@/lib/placement/stellium-box-placement-labels";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";

describe("souscription placement vs SCPI", () => {
  it("scinde Souscription selon le produit", () => {
    expect(
      placementStelliumLabelMatchesEmailTrigger(
        { stellium_label: "Souscription", product_label: "Cristalliance Evoluvie" },
        AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL
      )
    ).toBe(true);
    expect(
      placementStelliumLabelMatchesEmailTrigger(
        { stellium_label: "Souscription", product_label: "Comète" },
        AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL
      )
    ).toBe(false);
    expect(
      placementStelliumLabelMatchesEmailTrigger(
        { stellium_label: "Souscription", product_label: "Comète" },
        SCPI_STELLIUM_SOUSCRIPTION_LABEL
      )
    ).toBe(true);
    expect(
      placementStelliumLabelMatchesEmailTrigger(
        { stellium_label: "Souscription", product_label: "Cristalliance Evoluvie" },
        SCPI_STELLIUM_SOUSCRIPTION_LABEL
      )
    ).toBe(false);
  });

  it("route le bon modèle email", () => {
    const placementTpl: TemplateEmail = {
      id: 1,
      nom: "Placement",
      sujet: "",
      corps: "",
      categorie: "RELANCE",
      variables: JSON.stringify({
        placement_conforme_trigger: {
          enabled: true,
          stellium_labels: [AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL],
        },
      }),
      agenda_link_id: null,
      relance_template_id: null,
      tutoiement_template_id: null,
      created_at: 0,
      updated_at: 0,
    };
    const scpiTpl: TemplateEmail = {
      ...placementTpl,
      id: 2,
      nom: "SCPI",
      variables: JSON.stringify({
        placement_conforme_trigger: {
          enabled: true,
          stellium_labels: [SCPI_STELLIUM_SOUSCRIPTION_LABEL],
        },
      }),
    };
    const templates = [placementTpl, scpiTpl];
    const avOp = {
      operation_type: "SOUSCRIPTION",
      stellium_label: "Souscription",
      product_label: "Cristalliance Evoluvie",
    };
    const scpiOp = {
      operation_type: "SOUSCRIPTION",
      stellium_label: "Souscription",
      product_label: "Comète",
    };
    expect(findPlacementConformeTemplatesForOperation(templates, avOp).map((t) => t.id)).toEqual([
      1,
    ]);
    expect(findPlacementConformeTemplatesForOperation(templates, scpiOp).map((t) => t.id)).toEqual([
      2,
    ]);
    expect(
      placementOperationMatchesConformeTrigger(avOp, {
        enabled: true,
        stellium_labels: [AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL],
      })
    ).toBe(true);
    expect(
      placementOperationMatchesConformeTrigger(scpiOp, {
        enabled: true,
        stellium_labels: [SCPI_STELLIUM_SOUSCRIPTION_LABEL],
      })
    ).toBe(true);
  });
});
