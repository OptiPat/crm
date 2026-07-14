import { describe, expect, it } from "vitest";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  filterLibraryTemplates,
  isOrphanEphemeralTuTemplate,
  isPipeRdvChildTemplate,
  isRelanceChildTemplate,
  isTutoiementChildTemplate,
  resolveCampaignTemplateId,
} from "@/lib/emails/template-library";

const base = (id: number, overrides: Partial<TemplateEmail> = {}): TemplateEmail => ({
  id,
  nom: `Modèle ${id}`,
  sujet: "",
  corps: "",
  categorie: "RELANCE",
  variables: null,
  agenda_link_id: null,
  relance_template_id: null,
  tutoiement_template_id: null,
  created_at: 0,
  updated_at: 0,
  ...overrides,
});

describe("template-library", () => {
  it("repère un modèle enfant de relance", () => {
    const parent = base(1, { nom: "Suivi > 1 an", relance_template_id: 2 });
    const child = base(2, { nom: "Relance — Suivi > 1 an" });
    expect(isRelanceChildTemplate(2, [parent, child])).toBe(true);
    expect(isRelanceChildTemplate(1, [parent, child])).toBe(false);
  });

  it("repère un modèle enfant tutoiement", () => {
    const parent = base(1, { tutoiement_template_id: 2 });
    const child = base(2, { nom: "Suivi (tu)" });
    expect(isTutoiementChildTemplate(2, [parent, child])).toBe(true);
    expect(isTutoiementChildTemplate(1, [parent, child])).toBe(false);
  });

  it("masque les relances liées de la bibliothèque", () => {
    const parent = base(1, { relance_template_id: 2 });
    const child = base(2, { nom: "Relance — parent" });
    const solo = base(3, { nom: "Newsletter" });
    expect(filterLibraryTemplates([parent, child, solo]).map((t) => t.id)).toEqual([1, 3]);
  });

  it("masque les variantes tutoiement liées", () => {
    const parent = base(10, { tutoiement_template_id: 11 });
    const tu = base(11, { nom: "Campagne (tu)" });
    const solo = base(12, { nom: "Autre" });
    expect(filterLibraryTemplates([parent, tu, solo]).map((t) => t.id)).toEqual([10, 12]);
  });

  it("résout un modèle enfant vers le parent pour campagne étiquette", () => {
    const parent = base(10, { tutoiement_template_id: 11 });
    const tu = base(11, { nom: "Girardin (tu)" });
    expect(resolveCampaignTemplateId(11, [parent, tu])).toBe(10);
    expect(resolveCampaignTemplateId(10, [parent, tu])).toBe(10);
  });

  it("masque les modèles Pipe RDV rappel / suivi liés", () => {
    const parent = base(20, {
      nom: "RDV R1",
      variables: JSON.stringify({
        pipe_rdv_reminder: {
          enabled: true,
          delai_heures: 24,
          use_same_message: false,
          reminder_template_id: 21,
          reminder_tutoiement_template_id: 22,
        },
        pipe_rdv_follow_up: {
          enabled: true,
          delai_heures: 24,
          use_same_message: false,
          follow_up_template_id: 23,
          follow_up_tutoiement_template_id: 24,
        },
      }),
    });
    const reminder = base(21, { nom: "Rappel RDV — RDV R1" });
    const reminderTu = base(22, { nom: "Rappel RDV — RDV R1 (tu)" });
    const followUp = base(23, { nom: "Suivi RDV — RDV R1" });
    const followUpTu = base(24, { nom: "Suivi RDV — RDV R1 (tu)" });
    const solo = base(25, { nom: "Newsletter" });
    expect(isPipeRdvChildTemplate(21, [parent, reminder])).toBe(true);
    expect(isPipeRdvChildTemplate(22, [parent, reminderTu])).toBe(true);
    expect(filterLibraryTemplates([parent, reminder, reminderTu, followUp, followUpTu, solo]).map(
      (t) => t.id
    )).toEqual([20, 25]);
    expect(resolveCampaignTemplateId(23, [parent, followUp])).toBe(20);
  });

  it("masque les variantes tu orphelines d'une campagne éphémère", () => {
    const parent = base(30, {
      nom: "Arbitrage SCI VIA GENERATIONS",
      variables: JSON.stringify({ is_ephemeral: true, ephemeral_campaign: { status: "draft" } }),
    });
    const orphanTu = base(31, {
      nom: "Arbitrage SCI VIA GENERATIONS (tu)",
      variables: null,
    });
    const solo = base(32, { nom: "Newsletter" });
    expect(isOrphanEphemeralTuTemplate(orphanTu, [parent, orphanTu, solo])).toBe(true);
    expect(filterLibraryTemplates([parent, orphanTu, solo]).map((t) => t.id)).toEqual([30, 32]);
  });

  it("conserve le tu permanent lié si une éphémère porte le même nom", () => {
    const permanentParent = base(40, {
      nom: "Arbitrage SCI VIA GENERATIONS",
      tutoiement_template_id: 41,
    });
    const permanentTu = base(41, { nom: "Arbitrage SCI VIA GENERATIONS (tu)" });
    const ephemeralParent = base(42, {
      nom: "Arbitrage SCI VIA GENERATIONS",
      variables: JSON.stringify({ is_ephemeral: true, ephemeral_campaign: { status: "draft" } }),
    });
    expect(filterLibraryTemplates([permanentParent, permanentTu, ephemeralParent]).map((t) => t.id)).toEqual([
      40, 42,
    ]);
  });

  it("affiche les éphémères actives et masque les archivées", () => {
    const draft = base(10, {
      variables: JSON.stringify({ is_ephemeral: true, ephemeral_campaign: { status: "draft" } }),
    });
    const prepared = base(11, {
      variables: JSON.stringify({ is_ephemeral: true, ephemeral_campaign: { status: "prepared" } }),
    });
    const archived = base(12, {
      variables: JSON.stringify({ is_ephemeral: true, ephemeral_campaign: { status: "archived" } }),
    });
    const permanent = base(13, { nom: "Suivi annuel" });
    expect(filterLibraryTemplates([draft, prepared, archived, permanent]).map((t) => t.id)).toEqual([
      10, 11, 13,
    ]);
  });
});
