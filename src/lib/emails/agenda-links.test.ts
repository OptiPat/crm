import { describe, expect, it } from "vitest";
import {
  buildAgendaTemplateVariables,
  normalizeAgendaLinks,
  resolveAgendaUrl,
} from "./agenda-links";

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
});
