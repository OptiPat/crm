import { describe, expect, it } from "vitest";
import {
  buildEmailHtmlBody,
  decodeHtmlEntities,
  stripPlainBodyEmailSignature,
} from "./email-signature";

describe("email-signature", () => {
  it("décode &#39;", () => {
    expect(decodeHtmlEntities("l&#39;Orias")).toBe("l'Orias");
  });

  it("assemble HTML avec signature logo", () => {
    const html = buildEmailHtmlBody("Bonjour,\n\nMessage.", {
      wizard_completed: true,
      wizard_step: 0,
      email_signature: "l'Orias",
      email_signature_html:
        '<img src="https://example.com/logo.png" alt="logo">',
    });
    expect(html).toContain("logo.png");
    expect(html).toContain("Bonjour");
    expect(html).not.toContain("margin:0 0 0.5em");
    expect(html).toContain('line-height:1.5;margin:0;padding:0');
  });

  it("stripPlainBodyEmailSignature retire le bloc -- signature", () => {
    const body = "Bonjour,\n\nMessage.\n\n--\nCordialement,\nJean DUPONT";
    const stripped = stripPlainBodyEmailSignature(body, "Cordialement,\nJean DUPONT");
    expect(stripped).toBe("Bonjour,\n\nMessage.");
  });
});
