import { describe, expect, it } from "vitest";
import {
  buildTemplateVariables,
  getScpiBulletinSendBlockReason,
  isScpiBulletinContentMissing,
  isScpiBulletinSendBlocked,
  localDatetimeToUnix,
  renderEtiquetteEmailPreview,
  unixToLocalDatetime,
} from "./etiquette-email-preview";
import { CURRENT_SCPI_DIGEST_VERSION } from "@/lib/emails/scpi-digest-stale";
import { setTemplateCorpsHtmlInMeta } from "@/lib/emails/template-email-html";
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

  it("envoie le HTML du modèle quand corps_html est défini", () => {
    const vars = setTemplateCorpsHtmlInMeta(
      null,
      "<p>Bonjour <strong>{{prenom}}</strong></p>"
    );
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
      template_corps: "Bonjour {{prenom}}",
      template_variables: vars,
      template_agenda_link_id: null,
      queue_issue: null,
    };
    const rendered = renderEtiquetteEmailPreview(item, {
      wizard_completed: true,
      wizard_step: 4,
      email_signature_html: "<p>Signature</p>",
    });
    expect(rendered.body_html).toContain("<strong>Jean</strong>");
    expect(rendered.body_html).toContain("Signature");
  });

  it("convertit bulletin_resume markdown en HTML pour l'envoi", () => {
    const item: EtiquetteEmailQueueItem = {
      contact_etiquette_id: 1,
      contact_id: 2,
      contact_nom: "Dupont",
      contact_prenom: "Jean",
      contact_email: "j.dupont@example.com",
      contact_telephone: null,
      etiquette_id: 42,
      etiquette_nom: "Campagne SCPI",
      etiquette_couleur: "#6366F1",
      email_date_prevue: null,
      email_date_envoi: null,
      template_sujet: "Bulletins {{periode}}",
      template_corps: "{{bulletin_resume}}",
      template_agenda_link_id: null,
      template_categorie: "NEWSLETTER",
      template_variables: setTemplateCorpsHtmlInMeta(
        null,
        '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">{{bulletin_resume_html}}</div></div>'
      ),
      campaign_variables: JSON.stringify({
        periode: "T1 2026",
        bulletin_resume: "## Comète\n\n- Collecte : 132 M€",
      }),
      queue_issue: null,
    };
    const rendered = renderEtiquetteEmailPreview(item, null);
    expect(rendered.body_html).toContain("132 M€");
    expect(rendered.body_html).toContain("<ul");
  });

  it("isScpiBulletinContentMissing si modèle SCPI sans bulletin_resume", () => {
    const base: EtiquetteEmailQueueItem = {
      contact_etiquette_id: 1,
      contact_id: 2,
      contact_nom: "Dupont",
      contact_prenom: "Jean",
      contact_email: "j.dupont@example.com",
      contact_telephone: null,
      etiquette_id: 42,
      etiquette_nom: "Bulletin SCPI trimestriel",
      etiquette_couleur: "#6366F1",
      email_date_prevue: null,
      email_date_envoi: null,
      template_sujet: "Bulletins",
      template_corps: "{{scpi_intro_vous}} {{bulletin_resume}}",
      template_agenda_link_id: null,
      template_categorie: null,
      template_variables: null,
      campaign_variables: JSON.stringify({ periode: "T1 2026", bulletin_resume: "1. Comète" }),
      queue_issue: null,
    };
    expect(isScpiBulletinContentMissing(base)).toBe(false);
    expect(
      isScpiBulletinContentMissing({
        ...base,
        campaign_variables: JSON.stringify({ periode: "T1 2026" }),
      })
    ).toBe(true);
  });

  it("isScpiBulletinSendBlocked si digest périmé", () => {
    const base: EtiquetteEmailQueueItem = {
      contact_etiquette_id: 1,
      contact_id: 2,
      contact_nom: "Dupont",
      contact_prenom: "Jean",
      contact_email: "j.dupont@example.com",
      contact_telephone: null,
      etiquette_id: 42,
      etiquette_nom: "Bulletin SCPI trimestriel",
      etiquette_couleur: "#6366F1",
      email_date_prevue: null,
      email_date_envoi: null,
      template_sujet: "Bulletins",
      template_corps: "{{bulletin_resume}}",
      template_agenda_link_id: null,
      template_categorie: null,
      template_variables: null,
      campaign_variables: JSON.stringify({
        periode: "T1 2026",
        bulletin_resume: "1. Comète",
        digest_version: CURRENT_SCPI_DIGEST_VERSION - 1,
      }),
      queue_issue: null,
    };
    expect(isScpiBulletinSendBlocked(base)).toBe(true);
    expect(getScpiBulletinSendBlockReason(base)).toContain("Digest périmé");
  });
});
