import { describe, expect, it } from "vitest";
import {
  buildEmailHtmlBody,
  decodeHtmlEntities,
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
  });
});
