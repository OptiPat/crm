import { describe, expect, it } from "vitest";
import {
  correctionSubject,
  DEFAULT_CORRECTION_TEXT_TU,
  DEFAULT_CORRECTION_TEXT_VOUS,
  isTutoiement,
  renderCorrectionText,
  resolveTemplateAgendaUrl,
  sendableCorrectionTargets,
} from "./template-email-correction";
import type { TemplateCorrectionTarget } from "@/lib/api/tauri-template-correction";

const LINK = "https://calendar.app.google/knJxWRNRWt59Mq7D9";

function target(over: Partial<TemplateCorrectionTarget> = {}): TemplateCorrectionTarget {
  return {
    row_id: 1,
    queue_row_kind: "template",
    contact_id: 10,
    contact_prenom: "Léa",
    contact_nom: "Martin",
    contact_email: "lea@example.com",
    contact_registre: "TU",
    sent_subject: "Léa, tu préfères payer le fisc ?",
    email_date_envoi: 1,
    gmail_thread_id: "thr",
    gmail_message_id: "msg",
    already_corrected: false,
    ...over,
  };
}

describe("template-email-correction", () => {
  it("résout le lien d'agenda du modèle", () => {
    const url = resolveTemplateAgendaUrl(
      { corps: "Réserve 👉 {{lien_agenda_suivi_arbitrage_coaching}}", variables: null, agenda_link_id: null },
      {
        agenda_links: [
          { id: "ir", label: "IR", url: "https://calendar.app.google/2b5u" },
          { id: "suivi_arbitrage_coaching", label: "Suivi", url: LINK },
        ],
      }
    );
    expect(url).toBe(LINK);
  });

  it("objet en Re: une seule fois", () => {
    expect(correctionSubject("Léa, objet")).toBe("Re: Léa, objet");
    expect(correctionSubject("Re: Léa, objet")).toBe("Re: Léa, objet");
  });

  it("texte tu / vous avec prénom et lien", () => {
    const tu = renderCorrectionText(DEFAULT_CORRECTION_TEXT_TU, target(), LINK);
    expect(tu.startsWith("Bonjour Léa,")).toBe(true);
    expect(tu).toContain("ton créneau 👉 " + LINK);
    const vous = renderCorrectionText(
      DEFAULT_CORRECTION_TEXT_VOUS,
      target({ contact_prenom: "Jean Marc", contact_registre: "VOUS" }),
      LINK
    );
    expect(vous.startsWith("Bonjour Jean Marc,")).toBe(true);
    expect(vous).toContain("votre créneau");
    expect(isTutoiement(target({ contact_registre: "vous" }))).toBe(false);
  });

  it("exclut les envois déjà corrigés et sans email", () => {
    const list = sendableCorrectionTargets([
      target({ row_id: 1 }),
      target({ row_id: 2, already_corrected: true }),
      target({ row_id: 3, contact_email: " " }),
    ]);
    expect(list.map((t) => t.row_id)).toEqual([1]);
  });
});
