import { describe, expect, it } from "vitest";
import {
  formatNewsletterBodyHtml,
  newsletterFieldToPlain,
} from "@/lib/newsletter/newsletter-rich-text";

describe("newsletter-rich-text", () => {
  it("conserve le gras et l'italique en HTML email", () => {
    const html = formatNewsletterBodyHtml(
      "<div>Texte <b>gras</b> et <i>italique</i> <u>souligné</u></div>"
    );
    expect(html).toContain("<b");
    expect(html).toContain("gras");
    expect(html).toContain("<i");
    expect(html).toContain("italique");
    expect(html).toContain("<u");
    expect(html).toContain("souligné");
  });

  it("convertit le texte brut historique", () => {
    expect(formatNewsletterBodyHtml("Ligne 1\nLigne 2")).toBe("Ligne 1<br>Ligne 2");
  });

  it("extrait le plain depuis HTML", () => {
    expect(newsletterFieldToPlain("<div>Hello <b>world</b></div>")).toContain("Hello");
    expect(newsletterFieldToPlain("Plain")).toBe("Plain");
  });
});
