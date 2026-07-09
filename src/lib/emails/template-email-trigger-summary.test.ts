import { describe, expect, it } from "vitest";
import {
  formatTemplateEmailTriggerScheduleBadge,
  formatTemplateEmailTriggerScheduleLabel,
  formatTemplateEmailTriggerSummary,
} from "./template-email-trigger-summary";
import type { TemplateEmailTriggerConfig } from "./template-email-trigger";
import { triggerRuleTreeToConfig, defaultTriggerRuleChildren } from "./template-email-trigger-rule-tree";

const baseTrigger: TemplateEmailTriggerConfig = {
  enabled: true,
  condition_type: "EVENEMENT_SOUSCRIPTION",
  condition_config: '{"types":[],"a_chaque_souscription":true}',
  categories: ["CLIENT"],
  delai_jours: 45,
  envoi_heure: "19:00",
  envoi_jours_semaine: '["MER"]',
  a_chaque_souscription: true,
  excluded_contact_ids: [],
};

describe("template-email-trigger-summary", () => {
  it("résume une souscription avec planification", () => {
    const summary = formatTemplateEmailTriggerSummary(baseTrigger);
    expect(summary).toContain("Événement : nouvelle souscription");
    expect(summary).toContain("un envoi à chaque investissement");
    expect(summary).toContain("Suivi → Envois");
    expect(summary).toContain("45 jours");
    expect(summary).toContain("19:00");
    expect(summary).toContain("mercredi");
  });

  it("formate le badge de planification", () => {
    expect(formatTemplateEmailTriggerScheduleBadge(baseTrigger)).toBe(
      "J+45 · 19:00 · mer"
    );
  });

  it("formate la planification sans jour de semaine", () => {
    expect(
      formatTemplateEmailTriggerScheduleLabel({
        delai_jours: 0,
        envoi_heure: "09:00",
        envoi_jours_semaine: null,
      })
    ).toBe("le jour du déclenchement à 09:00");
  });

  it("résume une règle combinée", () => {
    const rule = triggerRuleTreeToConfig("and", defaultTriggerRuleChildren());
    const summary = formatTemplateEmailTriggerSummary({
      ...baseTrigger,
      condition_type: rule.condition_type,
      condition_config: rule.condition_config,
      categories: rule.categories,
      delai_jours: 3,
      envoi_heure: "10:30",
      envoi_jours_semaine: null,
    });
    expect(summary).toContain("2 conditions (ET)");
    expect(summary).toContain("3 jours");
  });
});
