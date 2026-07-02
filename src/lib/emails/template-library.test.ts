import { describe, expect, it } from "vitest";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  filterLibraryTemplates,
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

  it("masque les campagnes éphémères archivées", () => {
    const active = base(10, {
      variables: JSON.stringify({ is_ephemeral: true, ephemeral_campaign: { status: "prepared" } }),
    });
    const archived = base(11, {
      variables: JSON.stringify({ is_ephemeral: true, ephemeral_campaign: { status: "archived" } }),
    });
    expect(filterLibraryTemplates([active, archived]).map((t) => t.id)).toEqual([10]);
  });
});
