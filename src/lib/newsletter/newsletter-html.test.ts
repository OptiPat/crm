import { describe, expect, it } from "vitest";
import {
  buildNewsletterPlainBody,
  parseNewsletterTemplateMeta,
  serializeNewsletterTemplateMeta,
} from "@/lib/newsletter/newsletter-html";

describe("newsletter-html", () => {
  it("buildNewsletterPlainBody assembles sections", () => {
    const plain = buildNewsletterPlainBody({
      subject: "Objet",
      intro: "Bonjour {{prenom}},",
      sections: [{ title: "Point clé", body: "Corps du point." }],
      cta: "Prenez rendez-vous.",
    });
    expect(plain).toContain("Bonjour {{prenom}},");
    expect(plain).toContain("Point clé");
    expect(plain).toContain("Prenez rendez-vous.");
  });

  it("serializes and parses newsletter HTML meta", () => {
    const json = serializeNewsletterTemplateMeta("<html>test</html>");
    const meta = parseNewsletterTemplateMeta(json);
    expect(meta?.newsletter_html).toBe("<html>test</html>");
  });
});
