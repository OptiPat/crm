import { describe, expect, it } from "vitest";
import {
  isRdvLikeCtaText,
  resolveNewsletterCta,
  shouldShowNewsletterAgendaBlock,
} from "@/lib/newsletter/newsletter-cta";
import type { GeneratedNewsletterContent } from "@/lib/api/tauri-newsletter";

const base: GeneratedNewsletterContent = {
  subject: "Objet",
  intro: "Intro",
  sections: [],
  cta: "",
};

describe("newsletter-cta", () => {
  it("detects RDV-like CTA text", () => {
    expect(isRdvLikeCtaText("Prenez rendez-vous pour en discuter.")).toBe(true);
    expect(isRdvLikeCtaText("Contactez votre conseiller.")).toBe(false);
  });

  it("fuses RDV text with agenda into a single button", () => {
    const resolved = resolveNewsletterCta(
      { ...base, cta: "Prenez rendez-vous pour en discuter." },
      { agendaUrl: "https://calendly.com/test" }
    );
    expect(resolved.mode).toBe("button");
    expect(resolved.buttonLabel).toBe("Prendre rendez-vous");
    expect(resolved.buttonHref).toBe("https://calendly.com/test");
    expect(resolved.agendaConsumed).toBe(true);
    expect(resolved.introAboveButton).toBeUndefined();
  });

  it("uses explicit ctaUrl as button", () => {
    const resolved = resolveNewsletterCta(
      {
        ...base,
        cta: "Découvrez notre guide fiscal.",
        ctaLabel: "Télécharger le guide",
        ctaUrl: "https://cabinet.fr/guide",
      },
      { agendaUrl: "https://calendly.com/test" }
    );
    expect(resolved.mode).toBe("button");
    expect(resolved.buttonLabel).toBe("Télécharger le guide");
    expect(resolved.buttonHref).toBe("https://cabinet.fr/guide");
    expect(resolved.agendaConsumed).toBe(false);
    expect(resolved.introAboveButton).toBe("Découvrez notre guide fiscal.");
  });

  it("keeps non-RDV text as text block when agenda exists", () => {
    const resolved = resolveNewsletterCta(
      { ...base, cta: "N'hésitez pas à me contacter pour toute question." },
      { agendaUrl: "https://calendly.com/test" }
    );
    expect(resolved.mode).toBe("text");
    expect(resolved.text).toContain("contacter");
    expect(resolved.agendaConsumed).toBe(false);
  });

  it("hides agenda button when already consumed as CTA", () => {
    const resolved = resolveNewsletterCta(
      { ...base, cta: "Prenez rendez-vous." },
      { agendaUrl: "https://calendly.com/test" }
    );
    expect(
      shouldShowNewsletterAgendaBlock(
        { ...base, cta: "Prenez rendez-vous." },
        { agendaUrl: "https://calendly.com/test", cgpEmail: "a@b.fr" },
        resolved
      )
    ).toBe(true);
    expect(resolved.agendaConsumed).toBe(true);
  });

  it("returns none when includeCta is false", () => {
    const resolved = resolveNewsletterCta(
      { ...base, cta: "Prenez rendez-vous.", includeCta: false },
      { agendaUrl: "https://calendly.com/test" }
    );
    expect(resolved.mode).toBe("none");
    expect(
      shouldShowNewsletterAgendaBlock(
        { ...base, includeCta: false },
        { agendaUrl: "https://calendly.com/test", cgpEmail: "a@b.fr" },
        resolved
      )
    ).toBe(false);
  });
});
