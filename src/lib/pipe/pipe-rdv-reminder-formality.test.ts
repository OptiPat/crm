import { describe, expect, it } from "vitest";
import { pickTemplateContentForRegistre } from "@/lib/emails/template-email-formality";
import { pipeRdvRegistreForContact } from "@/lib/pipe/pipe-rdv-email-vars";

describe("pipe-rdv reminder formality", () => {
  const principal = { sujet: "Rappel vous", corps: "Bonjour vous", variables: null };
  const tutoiement = { sujet: "Rappel tu", corps: "Bonjour tu", variables: null };

  it("contact solo tu → variante tutoiement du rappel", () => {
    const registre = pipeRdvRegistreForContact({ registre: "TU" }, { secondary_contact_id: null });
    const content = pickTemplateContentForRegistre(principal, tutoiement, registre);
    expect(content.sujet).toBe("Rappel tu");
  });

  it("couple sur affaire → vouvoiement même si fiche tu", () => {
    const registre = pipeRdvRegistreForContact({ registre: "TU" }, { secondary_contact_id: 2 });
    expect(registre).toBe("VOUS");
    const content = pickTemplateContentForRegistre(principal, tutoiement, registre);
    expect(content.sujet).toBe("Rappel vous");
  });
});
