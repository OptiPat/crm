import { describe, expect, it } from "vitest";
import {
  etiquettesSouscriptionDuplicateForTemplate,
  formatSouscriptionDuplicateWarning,
  resolveTemplateSouscriptionDuplicateWarning,
  templateHasSouscriptionTrigger,
} from "@/lib/emails/template-etiquette-duplicate";

describe("template-etiquette-duplicate", () => {
  it("détecte le déclencheur modèle souscription", () => {
    expect(
      templateHasSouscriptionTrigger({
        variables: JSON.stringify({
          email_trigger: { enabled: true, condition_type: "EVENEMENT_SOUSCRIPTION" },
        }),
      })
    ).toBe(true);
  });

  it("formate un avertissement", () => {
    const msg = formatSouscriptionDuplicateWarning("Bienvenue", ["Campagne A"]);
    expect(msg).toContain("Bienvenue");
    expect(msg).toContain("Campagne A");
  });

  it("filtre les étiquettes doublons", () => {
    const dupes = etiquettesSouscriptionDuplicateForTemplate(1, [
      {
        id: 1,
        nom: "A",
        actif: true,
        auto_condition_type: "EVENEMENT_SOUSCRIPTION",
        email_template_id: 1,
      } as never,
      {
        id: 2,
        nom: "B",
        actif: true,
        auto_condition_type: "DELAI_SANS_CONTACT",
        email_template_id: 1,
      } as never,
    ]);
    expect(dupes).toHaveLength(1);
    expect(dupes[0].nom).toBe("A");
  });

  it("résout l'avertissement complet pour un modèle", () => {
    const msg = resolveTemplateSouscriptionDuplicateWarning(
      {
        id: 5,
        nom: "Bienvenue",
        variables: JSON.stringify({
          email_trigger: { enabled: true, condition_type: "EVENEMENT_SOUSCRIPTION" },
        }),
      },
      [
        {
          id: 1,
          nom: "Campagne A",
          actif: true,
          auto_condition_type: "EVENEMENT_SOUSCRIPTION",
          email_template_id: 5,
        } as never,
      ]
    );
    expect(msg).toContain("Bienvenue");
    expect(msg).toContain("Campagne A");
  });
});
