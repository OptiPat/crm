import { describe, expect, it } from "vitest";
import {
  formatNewsletterBodyHtml,
  formatNewsletterSectionTitleHtml,
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

  it("conserve font-size inline", () => {
    const html = formatNewsletterBodyHtml(
      '<div>Texte <span style="font-size:26px">grand</span></div>'
    );
    expect(html).toContain("font-size:26px");
  });

  it("aplatit le HTML titre de section sans casser le style parent", () => {
    const html = formatNewsletterSectionTitleHtml(
      '<div>Mon <b>titre</b> <span style="font-size:22px">clé</span></div>'
    );
    expect(html).not.toMatch(/<div/i);
    expect(html).toContain("<b");
    expect(html).toContain("titre");
    expect(html).toContain("font-size:22px");
  });
});
