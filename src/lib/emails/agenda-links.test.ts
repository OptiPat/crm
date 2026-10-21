import { describe, expect, it } from "vitest";
import {
  buildAgendaTemplateVariables,
  findUnresolvedAgendaTokens,
  normalizeAgendaLinks,
  normalizeAgendaLinkId,
  agendaLinkVariableKey,
  agendaLinkVariableToken,
  normalizeBrokenAgendaTokens,
  resolveAgendaUrl,
} from "./agenda-links";
import { replaceTemplateVariables } from "@/lib/api/tauri-templates-email";

describe("agenda-links", () => {
  it("migre l'ancien lien unique", () => {
    const links = normalizeAgendaLinks({
      lien_agenda: "https://example.com/rdv",
      wizard_completed: true,
      wizard_step: 0,
    });
    expect(links).toHaveLength(1);
    expect(links[0].id).toBe("principal");
  });

  it("résout lien_agenda selon le template", () => {
    const cgp = {
      agenda_links: [
        { id: "suivi", label: "Suivi", url: "https://a.test" },
        { id: "ir", label: "IR", url: "https://b.test" },
      ],
      wizard_completed: true,
      wizard_step: 0,
    };
    expect(resolveAgendaUrl(cgp, "suivi")).toBe("https://a.test");
    const vars = buildAgendaTemplateVariables(cgp, "suivi");
    expect(vars.lien_agenda).toBe("https://a.test");
    expect(vars.lien_agenda_ir).toBe("https://b.test");
  });

  it("normalise les tokens agenda dupliqués", () => {
    expect(
      normalizeBrokenAgendaTokens("RDV : {{lien_agenda_lien_agenda_suivi}}")
    ).toBe("RDV : {{lien_agenda_suivi}}");
    expect(normalizeBrokenAgendaTokens("{{lien_agenda_lien_agenda}}")).toBe(
      "{{lien_agenda}}"
    );
  });

  it("évite le double préfixe lien_agenda sur l'identifiant", () => {
    expect(normalizeAgendaLinkId("lien_agenda_suivi")).toBe("suivi");
    expect(agendaLinkVariableKey("lien_agenda_suivi")).toBe("lien_agenda_suivi");
    expect(agendaLinkVariableToken("lien_agenda_suivi")).toBe(
      "{{lien_agenda_suivi}}"
    );
    expect(agendaLinkVariableToken("suivi")).toBe("{{lien_agenda_suivi}}");
  });

  it("remplace lien_agenda_suivi sans casser le token", () => {
    const out = replaceTemplateVariables("{{lien_agenda_suivi}}", {
      lien_agenda: "https://wrong.test",
      lien_agenda_suivi: "https://suivi.test",
    });
    expect(out).toBe("https://suivi.test");
  });

  it("signale les liens d'agenda qui partiraient vides", () => {
    const cgp = {
      agenda_links: [{ id: "principal", label: "Principal", url: "https://cal.test/p" }],
    } as never;
    const ok = buildAgendaTemplateVariables(cgp, "principal");
    expect(findUnresolvedAgendaTokens("Réservez 👉 {{lien_agenda}} ou {{lien_agenda_principal}}", ok)).toEqual([]);
    // Lien choisi dans le modèle supprimé du profil + lien fixe inconnu.
    const broken = buildAgendaTemplateVariables(cgp, "suivi");
    expect(
      findUnresolvedAgendaTokens("{{ lien_agenda }} et {{lien_agenda_suivi}} et {{prenom}}", broken)
    ).toEqual(["{{lien_agenda}}", "{{lien_agenda_suivi}}"]);
    // Ancien jeton doublé : corrigé comme au rendu, pas bloqué à tort.
    expect(findUnresolvedAgendaTokens("{{lien_agenda_lien_agenda_principal}}", ok)).toEqual([]);
    // Aucun lien configuré.
    expect(findUnresolvedAgendaTokens("{{lien_calendly}}", buildAgendaTemplateVariables(null))).toEqual([
      "{{lien_calendly}}",
    ]);
  });
});
