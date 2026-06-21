import { describe, expect, it } from "vitest";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { setTemplateCorpsHtmlInMeta } from "@/lib/emails/template-email-html";
import {
  CURRENT_STELLIUM_PERF_DIGEST_VERSION,
  getStelliumPerfSendBlockReason,
  isStelliumPerfContentMissing,
  isStelliumPerfSendBlocked,
} from "./stellium-perf-send-guard";

function stelliumQueueItem(
  overrides: Partial<EtiquetteEmailQueueItem> = {}
): EtiquetteEmailQueueItem {
  return {
    contact_etiquette_id: 1,
    contact_id: 2,
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    contact_email: "jean@example.com",
    contact_telephone: null,
    etiquette_id: 42,
    etiquette_nom: "Performance AV/PER Stellium — Juin 2026",
    etiquette_couleur: "#6366F1",
    email_date_prevue: null,
    email_date_envoi: null,
    template_sujet: "Performance {{periode}}",
    template_corps: "{{perf_intro_vous}} {{perf_resume}}",
    template_agenda_link_id: null,
    template_categorie: "NEWSLETTER",
    template_variables: setTemplateCorpsHtmlInMeta(null, "{{perf_resume_html}}"),
    campaign_variables: JSON.stringify({
      periode: "Juin 2026",
      perf_resume: "• AV — Encours 1 000 €",
      digest_version: CURRENT_STELLIUM_PERF_DIGEST_VERSION,
    }),
    queue_issue: null,
    ...overrides,
  };
}

describe("stellium-perf-send-guard", () => {
  it("ignore les envois hors campagne Stellium", () => {
    const item = stelliumQueueItem({ etiquette_nom: "Newsletter générique" });
    expect(getStelliumPerfSendBlockReason(item)).toBeNull();
    expect(isStelliumPerfSendBlocked(item)).toBe(false);
  });

  it("isStelliumPerfContentMissing si modèle perf sans perf_resume", () => {
    const base = stelliumQueueItem();
    expect(isStelliumPerfContentMissing(base)).toBe(false);
    expect(
      isStelliumPerfContentMissing({
        ...base,
        campaign_variables: JSON.stringify({ periode: "Juin 2026" }),
      })
    ).toBe(true);
  });

  it("isStelliumPerfSendBlocked si digest périmé", () => {
    const item = stelliumQueueItem({
      campaign_variables: JSON.stringify({
        periode: "Juin 2026",
        perf_resume: "• AV — Encours 1 000 €",
        digest_version: CURRENT_STELLIUM_PERF_DIGEST_VERSION - 1,
      }),
    });
    expect(isStelliumPerfSendBlocked(item)).toBe(true);
    expect(getStelliumPerfSendBlockReason(item)).toContain("périmé");
  });

  it("autorise l'envoi si contenu présent et digest à jour", () => {
    const item = stelliumQueueItem();
    expect(getStelliumPerfSendBlockReason(item)).toBeNull();
    expect(isStelliumPerfSendBlocked(item)).toBe(false);
  });
});
