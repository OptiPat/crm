import { describe, expect, it } from "vitest";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import {
  filterLibraryTemplates,
  isRelanceChildTemplate,
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

  it("masque les relances liées de la bibliothèque", () => {
    const parent = base(1, { relance_template_id: 2 });
    const child = base(2, { nom: "Relance — parent" });
    const solo = base(3, { nom: "Newsletter" });
    expect(filterLibraryTemplates([parent, child, solo]).map((t) => t.id)).toEqual([1, 3]);
  });
});
