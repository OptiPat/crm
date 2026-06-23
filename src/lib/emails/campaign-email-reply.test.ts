import { describe, expect, it } from "vitest";
import {
  defaultCampaignReplySubject,
  formatCampaignReplySubject,
  inferQueueRowKindFromEtiquetteNom,
  queueItemToExchangeReplyEntry,
} from "@/lib/emails/campaign-email-reply";

describe("formatCampaignReplySubject", () => {
  it("préfixe Re: avec l'objet envoyé", () => {
    expect(formatCampaignReplySubject("Votre dossier patrimonial")).toBe(
      "Re: Votre dossier patrimonial"
    );
  });

  it("ne double pas Re:", () => {
    expect(formatCampaignReplySubject("Re: Votre dossier")).toBe("Re: Votre dossier");
    expect(formatCampaignReplySubject("RE:  Bulletin SCPI")).toBe("Re: Bulletin SCPI");
  });

  it("fallback si objet absent", () => {
    expect(formatCampaignReplySubject(null)).toBe("Re: votre message");
  });
});

describe("inferQueueRowKindFromEtiquetteNom", () => {
  it("détecte les envois modèle direct", () => {
    expect(inferQueueRowKindFromEtiquetteNom("Modèle · SCPI")).toBe("template");
    expect(inferQueueRowKindFromEtiquetteNom("Relance")).toBe("etiquette");
  });
});

describe("queueItemToExchangeReplyEntry", () => {
  it("priorise email_sent_subject pour la réponse", () => {
    const entry = queueItemToExchangeReplyEntry({
      queue_row_kind: "etiquette",
      contact_etiquette_id: 12,
      contact_id: 3,
      contact_nom: "DUPONT",
      contact_prenom: "Marie",
      contact_email: "marie.dupont@example.com",
      contact_telephone: null,
      etiquette_id: 1,
      etiquette_nom: "Relance",
      etiquette_couleur: "#ccc",
      email_date_prevue: null,
      email_date_envoi: 1_700_000_000,
      template_sujet: "Modèle brut",
      template_corps: "Bonjour",
      template_agenda_link_id: null,
      queue_issue: null,
      email_sent_subject: "Objet réellement envoyé",
    });
    expect(defaultCampaignReplySubject(entry)).toBe("Re: Objet réellement envoyé");
  });
});
