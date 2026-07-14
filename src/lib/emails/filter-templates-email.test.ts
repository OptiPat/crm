import { describe, expect, it } from "vitest";
import { filterTemplatesEmail } from "@/lib/emails/filter-templates-email";
import { resolveTemplateEmailCategory } from "@/lib/emails/template-email-meta";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";

const base: TemplateEmail = {
  id: 1,
  nom: "Rappel IR",
  sujet: "Impôts",
  corps: "Bonjour",
  categorie: "FISCALITE",
  variables: null,
  agenda_link_id: null,
  relance_template_id: null,
  tutoiement_template_id: null,
  created_at: 0,
  updated_at: 0,
};

describe("filterTemplatesEmail", () => {
  it("filtre par catégorie", () => {
    const relance = { ...base, id: 2, nom: "Relance", categorie: "RELANCE" };
    expect(filterTemplatesEmail([base, relance], "", "FISCALITE")).toHaveLength(1);
  });

  it("filtre par recherche", () => {
    expect(filterTemplatesEmail([base], "IR", "all")).toHaveLength(1);
    expect(filterTemplatesEmail([base], "xyz", "all")).toHaveLength(0);
  });

  it("résout Éphémère depuis les variables et filtre par catégorie", () => {
    const ephemeral = {
      ...base,
      id: 3,
      nom: "Campagne test",
      categorie: "AUTRE",
      variables: JSON.stringify({ is_ephemeral: true, ephemeral_campaign: { status: "draft" } }),
    };
    expect(resolveTemplateEmailCategory(ephemeral)).toBe("EPHEMERE");
    expect(filterTemplatesEmail([base, ephemeral], "", "EPHEMERE")).toHaveLength(1);
    expect(filterTemplatesEmail([base, ephemeral], "", "AUTRE")).toHaveLength(0);
  });
});
