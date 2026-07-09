import { describe, expect, it } from "vitest";
import { buildTemplateEmailTriggerPreviewJson } from "./template-email-trigger-preview";
import type { TemplateEmailTriggerConfig } from "./template-email-trigger";
import { triggerRuleTreeToConfig, defaultTriggerRuleChildren } from "./template-email-trigger-rule-tree";

const baseTrigger: TemplateEmailTriggerConfig = {
  enabled: true,
  condition_type: "DELAI_SANS_CONTACT",
  condition_config: '{"jours":90,"inclure_sans_date":true}',
  categories: ["CLIENT"],
  delai_jours: 0,
  envoi_heure: "09:00",
  envoi_jours_semaine: null,
  a_chaque_souscription: true,
  excluded_contact_ids: [],
};

describe("buildTemplateEmailTriggerPreviewJson", () => {
  it("retourne null si déclencheur désactivé", () => {
    expect(
      buildTemplateEmailTriggerPreviewJson({ ...baseTrigger, enabled: false })
    ).toBeNull();
  });

  it("retourne null pour souscription (événement non prévisible)", () => {
    expect(
      buildTemplateEmailTriggerPreviewJson({
        ...baseTrigger,
        condition_type: "EVENEMENT_SOUSCRIPTION",
        condition_config: '{"types":[],"a_chaque_souscription":true}',
      })
    ).toBeNull();
  });

  it("construit un JSON pour délai sans contact", () => {
    const raw = buildTemplateEmailTriggerPreviewJson(baseTrigger);
    expect(raw).toContain("DELAI_SANS_CONTACT");
    expect(raw).toContain("90");
  });

  it("construit un JSON pour règle combinée valide", () => {
    const rule = triggerRuleTreeToConfig("and", defaultTriggerRuleChildren());
    const raw = buildTemplateEmailTriggerPreviewJson({
      ...baseTrigger,
      condition_type: rule.condition_type,
      condition_config: rule.condition_config,
      categories: rule.categories,
    });
    expect(raw).toContain("TMI");
    expect(raw).toContain("REVENUS_ANNUELS");
  });

  it("retourne null pour TMI sans tranche", () => {
    expect(
      buildTemplateEmailTriggerPreviewJson({
        ...baseTrigger,
        condition_type: "TMI",
        condition_config: '{"tranches":[]}',
      })
    ).toBeNull();
  });
});
