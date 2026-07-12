import { describe, expect, it } from "vitest";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  computeTemplatesEmailPageStats,
  getTemplateActivationFlags,
  getTemplateActivationPreviewHint,
  getTemplateRelanceBadgeLabel,
  getTemplateTriggerShortLabel,
  matchesTemplateActivationStatFilter,
} from "./template-email-activation";
import { setTemplateEmailTriggerInMeta } from "./template-email-trigger";
import { setTemplateEmailRelanceInMeta } from "./template-email-relance";

function base(id: number, patch: Partial<TemplateEmail> = {}): TemplateEmail {
  return {
    id,
    nom: `Modèle ${id}`,
    sujet: "Sujet",
    corps: "Corps",
    categorie: "RELANCE",
    variables: null,
    agenda_link_id: null,
    relance_template_id: null,
    tutoiement_template_id: null,
    created_at: 0,
    updated_at: 0,
    ...patch,
  };
}

describe("template-email-activation", () => {
  it("détecte déclencheur, étiquette, relance et tutoiement", () => {
    const triggerVars = setTemplateEmailTriggerInMeta(null, {
      enabled: true,
      condition_type: "DELAI_SANS_CONTACT",
      condition_config: '{"jours":30}',
      categories: ["CLIENT"],
      delai_jours: 0,
      envoi_heure: "09:00",
      envoi_jours_semaine: null,
      a_chaque_souscription: true,
      excluded_contact_ids: [],
    });
    const relanceVars = setTemplateEmailRelanceInMeta(triggerVars, {
      enabled: true,
      delai_jours: 7,
      envoi_heure: "18:30",
      envoi_jours_semaine: null,
    });

    const template = base(1, {
      variables: relanceVars,
      relance_template_id: 99,
      tutoiement_template_id: 88,
    });

    expect(getTemplateActivationFlags(template, 2)).toEqual({
      hasTrigger: true,
      hasEtiquetteLink: true,
      hasRelance: true,
      hasPipeRdv: false,
      hasTutoiement: true,
      hasSendChannel: true,
      isLibraryOnly: false,
    });
    expect(getTemplateTriggerShortLabel(template)).toBe(
      "Délai sans contact · 09:00"
    );
    expect(getTemplateRelanceBadgeLabel(template)).toBe("Relance J+7");
  });

  it("considère bibliothèque seule sans canal", () => {
    const flags = getTemplateActivationFlags(base(2), 0);
    expect(flags.isLibraryOnly).toBe(true);
    expect(flags.hasSendChannel).toBe(false);
    expect(getTemplateActivationPreviewHint(flags)).toContain("Bibliothèque seule");
  });

  it("filtre par stat d'activation", () => {
    const triggerOnly = base(3, {
      variables: setTemplateEmailTriggerInMeta(null, {
        enabled: true,
        condition_type: "EVENEMENT_SOUSCRIPTION",
        condition_config: '{"types":[],"a_chaque_souscription":true}',
        categories: ["CLIENT"],
        delai_jours: 0,
        envoi_heure: "09:00",
        envoi_jours_semaine: null,
        a_chaque_souscription: true,
        excluded_contact_ids: [],
      }),
    });
    const linkedOnly = base(4);
    const map = new Map<number, number>([[4, 1]]);

    expect(
      matchesTemplateActivationStatFilter(triggerOnly, map, "trigger")
    ).toBe(true);
    expect(
      matchesTemplateActivationStatFilter(linkedOnly, map, "etiquette")
    ).toBe(true);
    expect(
      matchesTemplateActivationStatFilter(linkedOnly, map, "trigger")
    ).toBe(false);
  });

  it("agrège les stats page", () => {
    const templates = [
      base(1, {
        variables: setTemplateEmailTriggerInMeta(null, {
          enabled: true,
          condition_type: "PERIODE_ANNEE",
          condition_config: null,
          categories: ["CLIENT"],
          delai_jours: 0,
          envoi_heure: "09:00",
          envoi_jours_semaine: null,
          a_chaque_souscription: true,
          excluded_contact_ids: [],
        }),
        relance_template_id: 10,
      }),
      base(2),
    ];
    const map = new Map<number, number>([[2, 2]]);

    expect(computeTemplatesEmailPageStats(templates, map)).toEqual({
      total: 2,
      trigger: 1,
      etiquette: 1,
      relance: 1,
      noChannel: 0,
    });
  });
});
