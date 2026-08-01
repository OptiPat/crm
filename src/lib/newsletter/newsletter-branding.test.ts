import { describe, expect, it } from "vitest";
import {
  DEFAULT_NEWSLETTER_ACCENT,
  DEFAULT_NEWSLETTER_HEADER_TEXT,
  DEFAULT_NEWSLETTER_SECONDARY,
  DEFAULT_NEWSLETTER_TEXT,
  resolveNewsletterColors,
} from "@/lib/newsletter/newsletter-branding";

describe("resolveNewsletterColors", () => {
  it("uses legacy accent/secondary when detailed colors are absent", () => {
    expect(
      resolveNewsletterColors({
        accentColor: "#112233",
        secondaryColor: "#aabbcc",
      })
    ).toEqual({
      headerColor: "#112233",
      headerTextColor: DEFAULT_NEWSLETTER_HEADER_TEXT,
      titleColor: "#112233",
      separatorColor: "#aabbcc",
      textColor: DEFAULT_NEWSLETTER_TEXT,
      buttonColor: "#112233",
    });
  });

  it("prefers explicit granular colors over legacy fields", () => {
    expect(
      resolveNewsletterColors({
        accentColor: "#112233",
        secondaryColor: "#aabbcc",
        headerColor: "#010101",
        headerTextColor: "#fefefe",
        titleColor: "#020202",
        separatorColor: "#030303",
        textColor: "#040404",
        buttonColor: "#050505",
      })
    ).toEqual({
      headerColor: "#010101",
      headerTextColor: "#fefefe",
      titleColor: "#020202",
      separatorColor: "#030303",
      textColor: "#040404",
      buttonColor: "#050505",
    });
  });

  it("falls back to defaults when nothing is set", () => {
    expect(resolveNewsletterColors({})).toEqual({
      headerColor: DEFAULT_NEWSLETTER_ACCENT,
      headerTextColor: DEFAULT_NEWSLETTER_HEADER_TEXT,
      titleColor: DEFAULT_NEWSLETTER_ACCENT,
      separatorColor: DEFAULT_NEWSLETTER_SECONDARY,
      textColor: DEFAULT_NEWSLETTER_TEXT,
      buttonColor: DEFAULT_NEWSLETTER_ACCENT,
    });
  });
});
