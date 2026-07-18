import { describe, expect, it } from "vitest";
import {
  SAMPLE_PIPE_RDV_PREVIEW_VARS,
  templateUsesPipeRdvVariables,
} from "@/lib/pipe/pipe-rdv-preview-vars";

describe("pipe-rdv-preview-vars", () => {
  it("detecte les variables Pipe RDV", () => {
    expect(
      templateUsesPipeRdvVariables("Rappel {{date_rdv}}", "Bonjour {{prenom}}")
    ).toBe(true);
    expect(templateUsesPipeRdvVariables("Bonjour {{prenom}}", "Suite…")).toBe(false);
    expect(
      templateUsesPipeRdvVariables("", "", "<p>Avec {{co_contact_prenom}}</p>")
    ).toBe(true);
  });

  it("expose un exemple couple pour l'aperçu", () => {
    expect(SAMPLE_PIPE_RDV_PREVIEW_VARS.co_contact_prenom).toBe("Jean");
    expect(SAMPLE_PIPE_RDV_PREVIEW_VARS.co_contact).toBe("DUPONT Jean");
    expect(SAMPLE_PIPE_RDV_PREVIEW_VARS.liste_documents_r1_html).toContain("<ul");
    expect(SAMPLE_PIPE_RDV_PREVIEW_VARS.liste_documents_r1_html).toContain("avis d'imposition");
  });
});
