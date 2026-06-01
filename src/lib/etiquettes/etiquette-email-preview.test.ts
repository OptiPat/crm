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
      template_corps: "Tel {{telephone}} — {{lien_agenda}}",
      template_agenda_link_id: "suivi",
      queue_issue: null,
    };
    const vars = buildTemplateVariables(item, {
      nom: "Martin",
      prenom: "Paul",
      agenda_links: [
        {
          id: "suivi",
          label: "Suivi",
          url: "https://calendar.google.com/calendar/appointments/test",
        },
      ],
      wizard_completed: true,
      wizard_step: 4,
    });
    expect(vars.prenom).toBe("Jean");
    expect(vars.telephone).toBe("0612345678");
    expect(vars.lien_agenda).toBe("https://calendar.google.com/calendar/appointments/test");

    const rendered = renderEtiquetteEmailPreview(item, {
      nom: "Martin",
      prenom: "Paul",
      agenda_links: [
        {
          id: "suivi",
          label: "Suivi",
          url: "https://calendar.google.com/calendar/appointments/test",
        },
      ],
      wizard_completed: true,
      wizard_step: 4,
    });
    expect(rendered.subject).toBe("Bonjour Jean Dupont");
    expect(rendered.body).toContain("0612345678");
  });

  it("injecte le millésime Exceltis depuis le nom d'étiquette", () => {
    const item: EtiquetteEmailQueueItem = {
      contact_etiquette_id: 1,
      contact_id: 2,
      contact_nom: "Dupont",
      contact_prenom: "Marie",
      contact_email: "marie@example.com",
      contact_telephone: null,
      etiquette_id: 3,
      etiquette_nom: "Exceltis — Février 2025",
      etiquette_couleur: "#EAB308",
      email_date_prevue: null,
      email_date_envoi: null,
      template_sujet: "Exceltis {{millesime}} — {{prenom}}",
      template_corps: "Étiquette : {{etiquette_nom}}",
      template_agenda_link_id: null,
      queue_issue: null,
    };
    const rendered = renderEtiquetteEmailPreview(item, null);
    expect(rendered.subject).toBe("Exceltis Février 2025 — Marie");
    expect(rendered.body).toContain("Exceltis — Février 2025");
  });

  it("ajoute la signature CGP en fin de corps", () => {
    const item: EtiquetteEmailQueueItem = {
      contact_etiquette_id: 1,
      contact_id: 2,
      contact_nom: "Dupont",
      contact_prenom: "Jean",
      contact_email: "jean@example.com",
      contact_telephone: null,
      etiquette_id: 3,
      etiquette_nom: "Campagne",
      etiquette_couleur: "#3B82F6",
      email_date_prevue: null,
      email_date_envoi: null,
      template_sujet: "Sujet",
      template_corps: "Message.",
      template_agenda_link_id: null,
      queue_issue: null,
    };
    const rendered = renderEtiquetteEmailPreview(item, {
      wizard_completed: true,
      wizard_step: 4,
      email_signature: "Paul Martin\nCabinet",
    });
    expect(rendered.body).toContain("Message.");
    expect(rendered.body).toContain("Paul Martin");
  });
});
