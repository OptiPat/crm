import { describe, expect, it } from "vitest";
import {
  expandLegacyPlacementConformeOperationTypes,
  findPlacementConformeTemplatesForOperation,
  parseTemplateEmailPlacementConformeTrigger,
  placementConformeTriggerBadgeLabel,
  placementOperationMatchesConformeTrigger,
  setTemplateEmailPlacementConformeTriggerInMeta,
} from "@/lib/emails/template-email-placement-conforme";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";

function baseTemplate(id: number, variables: string | null): TemplateEmail {
  return {
    id,
    nom: `Modèle ${id}`,
    sujet: "Sujet",
    corps: "Corps",
    categorie: "RELANCE",
    variables,
    agenda_link_id: null,
    relance_template_id: null,
    tutoiement_template_id: null,
    created_at: 0,
    updated_at: 0,
  };
}

describe("template-email-placement-conforme", () => {
  it("parse trigger par défaut", () => {
    expect(parseTemplateEmailPlacementConformeTrigger(null)).toEqual({
      enabled: false,
      stellium_labels: [],
    });
  });

  it("roundtrip meta trigger avec libellés Stellium", () => {
    const variables = setTemplateEmailPlacementConformeTriggerInMeta(null, {
      enabled: true,
      stellium_labels: ["Arbitrage libre", "Versement complémentaire"],
    });
    expect(parseTemplateEmailPlacementConformeTrigger(variables)).toEqual({
      enabled: true,
      stellium_labels: ["Arbitrage libre", "Versement complémentaire"],
    });
  });

  it("migre les anciens types grossiers vers les libellés fins", () => {
    const parsed = parseTemplateEmailPlacementConformeTrigger(
      JSON.stringify({
        placement_conforme_trigger: { enabled: true, operation_types: ["ARBITRAGE"] },
      })
    );
    expect(parsed.enabled).toBe(true);
    expect(parsed.stellium_labels).toContain("Arbitrage libre");
    expect(parsed.stellium_labels.length).toBeGreaterThan(1);
  });

  it("retombe sur operation_types si stellium_labels invalides", () => {
    const parsed = parseTemplateEmailPlacementConformeTrigger(
      JSON.stringify({
        placement_conforme_trigger: {
          enabled: true,
          stellium_labels: ["Libellé inventé"],
          operation_types: ["ARBITRAGE"],
        },
      })
    );
    expect(parsed.enabled).toBe(true);
    expect(parsed.stellium_labels).toContain("Arbitrage libre");
  });

  it("find templates for operation stellium_label", () => {
    const templates = [
      baseTemplate(
        1,
        JSON.stringify({
          placement_conforme_trigger: {
            enabled: true,
            stellium_labels: ["Arbitrage libre"],
          },
        })
      ),
      baseTemplate(
        2,
        JSON.stringify({
          placement_conforme_trigger: {
            enabled: true,
            stellium_labels: ["Versement complémentaire"],
          },
        })
      ),
    ];
    expect(
      findPlacementConformeTemplatesForOperation(templates, {
        operation_type: "ARBITRAGE",
        stellium_label: "Arbitrage libre",
      })
    ).toHaveLength(1);
  });

  it("placementOperationMatchesConformeTrigger sur libellé exact", () => {
    expect(
      placementOperationMatchesConformeTrigger(
        { operation_type: "ARBITRAGE", stellium_label: "Arbitrage libre" },
        { enabled: true, stellium_labels: ["Arbitrage libre"] }
      )
    ).toBe(true);
    expect(
      placementOperationMatchesConformeTrigger(
        { operation_type: "ARBITRAGE", stellium_label: "Rachat partiel" },
        { enabled: true, stellium_labels: ["Arbitrage libre"] }
      )
    ).toBe(false);
  });

  it("expandLegacyPlacementConformeOperationTypes", () => {
    const labels = expandLegacyPlacementConformeOperationTypes(["VERSEMENT", "SOUSCRIPTION"]);
    expect(labels).toContain("Versement complémentaire");
    expect(labels).toContain("souscription-placement::Souscription");
    expect(labels).toContain("scpi::Souscription de parts");
  });

  it("trigger scopé placement vs SCPI pour versements programmés", () => {
    const label = "Versements programmés : Mise en place";
    const placementScoped = `versements-programmes::${label}`;
    const scpiScoped = `scpi::${label}`;
    expect(
      placementOperationMatchesConformeTrigger(
        {
          operation_type: "VERSEMENT",
          stellium_label: label,
          product_label: "Cristalliance Evoluvie",
        },
        { enabled: true, stellium_labels: [placementScoped] }
      )
    ).toBe(true);
    expect(
      placementOperationMatchesConformeTrigger(
        {
          operation_type: "VERSEMENT",
          stellium_label: label,
          product_label: "Comète",
        },
        { enabled: true, stellium_labels: [placementScoped] }
      )
    ).toBe(false);
    expect(
      placementOperationMatchesConformeTrigger(
        {
          operation_type: "VERSEMENT",
          stellium_label: label,
          product_label: "Comète",
        },
        { enabled: true, stellium_labels: [scpiScoped] }
      )
    ).toBe(true);
  });

  it("placementConformeTriggerBadgeLabel", () => {
    expect(placementConformeTriggerBadgeLabel(null)).toBeNull();
    expect(
      placementConformeTriggerBadgeLabel(
        JSON.stringify({
          placement_conforme_trigger: {
            enabled: true,
            stellium_labels: ["Arbitrage libre"],
          },
        })
      )
    ).toBe("Box Placement — Arbitrage libre");
  });
});
