import { describe, expect, it } from "vitest";
import {
  buildTemplateVariables,
  localDatetimeToUnix,
  renderEtiquetteEmailPreview,
  unixToLocalDatetime,
} from "./etiquette-email-preview";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";

describe("etiquette-email-preview", () => {
  it("convertit datetime-local en unix et retour", () => {
    const local = "2026-06-15T10:30";
    const unix = localDatetimeToUnix(local);
    expect(unix).not.toBeNull();
    expect(unixToLocalDatetime(unix)).toBe(local);
  });

  it("retourne null pour chaîne vide", () => {
    expect(localDatetimeToUnix("")).toBeNull();
  });

  it("remplace les variables contact et CGP", () => {
    const item: EtiquetteEmailQueueItem = {
      contact_etiquette_id: 1,
      contact_id: 2,
      contact_nom: "Dupont",
      contact_prenom: "Jean",
      contact_email: "jean@example.com",
      contact_telephone: "0612345678",
      etiquette_id: 3,
      etiquette_nom: "Campagne",
      etiquette_couleur: "#3B82F6",
      email_date_prevue: null,
      email_date_envoi: null,
      template_sujet: "Bonjour {{prenom}} {{nom}}",
      template_corps: "Tel {{telephone}} — {{lien_calendly}}",
      queue_issue: null,
    };
    const vars = buildTemplateVariables(item, {
      nom: "Martin",
      prenom: "Paul",
      lien_calendly: "https://calendly.com/test",
      wizard_completed: true,
      wizard_step: 4,
    });
    expect(vars.prenom).toBe("Jean");
    expect(vars.telephone).toBe("0612345678");
    expect(vars.lien_calendly).toBe("https://calendly.com/test");

    const rendered = renderEtiquetteEmailPreview(item, {
      nom: "Martin",
      prenom: "Paul",
      wizard_completed: true,
      wizard_step: 4,
    });
    expect(rendered.subject).toBe("Bonjour Jean Dupont");
    expect(rendered.body).toContain("0612345678");
  });
});
