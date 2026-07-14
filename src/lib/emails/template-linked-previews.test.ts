import { describe, expect, it } from "vitest";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { buildTemplateLinkedPreviewSections } from "@/lib/emails/template-linked-previews";
import type { TemplateActivationFlags } from "@/lib/emails/template-email-activation";

const base: TemplateEmail = {
  id: 1,
  nom: "Parent",
  sujet: "Objet parent",
  corps: "Corps parent",
  categorie: "RELANCE",
  variables: null,
  agenda_link_id: null,
  relance_template_id: null,
  tutoiement_template_id: null,
  created_at: 0,
  updated_at: 0,
};

const noFlags: TemplateActivationFlags = {
  hasTrigger: false,
  hasEtiquetteLink: false,
  hasRelance: false,
  hasPipeRdv: false,
  hasPlacementConforme: false,
  hasTutoiement: false,
  hasSendChannel: false,
  isLibraryOnly: true,
};

describe("buildTemplateLinkedPreviewSections", () => {
  it("retourne vide sans relance ni pipe dédiés", () => {
    expect(buildTemplateLinkedPreviewSections(base, [base], noFlags)).toEqual([]);
  });

  it("inclut la relance liée si configurée", () => {
    const relance = {
      ...base,
      id: 2,
      nom: "Relance — Parent",
      sujet: "Relance objet",
      corps: "Relance corps",
    };
    const parent = {
      ...base,
      relance_template_id: 2,
      variables: JSON.stringify({ email_relance: { enabled: true, delai_jours: 5 } }),
    };
    const flags = { ...noFlags, hasRelance: true };
    const sections = buildTemplateLinkedPreviewSections(parent, [parent, relance], flags);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.id).toBe("relance");
    expect(sections[0]?.sujet).toBe("Relance objet");
    expect(sections[0]?.label).toContain("5 j après le 1er envoi");
  });

  it("inclut rappel et suivi Pipe RDV si modèles dédiés", () => {
    const reminder = { ...base, id: 3, nom: "Rappel", sujet: "Rappel RDV" };
    const followUp = { ...base, id: 4, nom: "Suivi", sujet: "Suivi RDV" };
    const parent = {
      ...base,
      variables: JSON.stringify({
        pipe_rdv_trigger: { enabled: true, stages: ["R1"] },
        pipe_rdv_reminder: {
          enabled: true,
          delai_heures: 24,
          use_same_message: false,
          reminder_template_id: 3,
        },
        pipe_rdv_follow_up: {
          enabled: true,
          delai_heures: 48,
          use_same_message: false,
          follow_up_template_id: 4,
        },
      }),
    };
    const flags = { ...noFlags, hasPipeRdv: true, hasSendChannel: true };
    const sections = buildTemplateLinkedPreviewSections(
      parent,
      [parent, reminder, followUp],
      flags
    );
    expect(sections.map((s) => s.id)).toEqual(["pipe-rdv-reminder", "pipe-rdv-follow-up"]);
  });

  it("ignore pipe si use_same_message", () => {
    const parent = {
      ...base,
      variables: JSON.stringify({
        pipe_rdv_trigger: { enabled: true, stages: ["R1"] },
        pipe_rdv_reminder: { enabled: true, delai_heures: 24, use_same_message: true },
      }),
    };
    const flags = { ...noFlags, hasPipeRdv: true, hasSendChannel: true };
    expect(buildTemplateLinkedPreviewSections(parent, [parent], flags)).toEqual([]);
  });
});
