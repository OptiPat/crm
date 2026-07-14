import { describe, expect, it } from "vitest";
import {
  findPlacementConformeTemplatesForOperationType,
  parseTemplateEmailPlacementConformeTrigger,
  placementConformeTriggerBadgeLabel,
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
      operation_types: [],
    });
  });

  it("roundtrip meta trigger", () => {
    const variables = setTemplateEmailPlacementConformeTriggerInMeta(null, {
      enabled: true,
      operation_types: ["ARBITRAGE", "REINVESTISSEMENT"],
    });
    expect(parseTemplateEmailPlacementConformeTrigger(variables)).toEqual({
      enabled: true,
      operation_types: ["ARBITRAGE", "REINVESTISSEMENT"],
    });
  });

  it("find templates for operation type", () => {
    const templates = [
      baseTemplate(
        1,
        JSON.stringify({
          placement_conforme_trigger: { enabled: true, operation_types: ["ARBITRAGE"] },
        })
      ),
      baseTemplate(
        2,
        JSON.stringify({
          placement_conforme_trigger: { enabled: true, operation_types: ["VERSEMENT"] },
        })
      ),
    ];
    expect(findPlacementConformeTemplatesForOperationType(templates, "ARBITRAGE")).toHaveLength(1);
  });

  it("placementConformeTriggerBadgeLabel", () => {
    expect(placementConformeTriggerBadgeLabel(null)).toBeNull();
    expect(
      placementConformeTriggerBadgeLabel(
        JSON.stringify({
          placement_conforme_trigger: { enabled: true, operation_types: ["ARBITRAGE"] },
        })
      )
    ).toBe("Box Placement ARBITRAGE");
  });
});
