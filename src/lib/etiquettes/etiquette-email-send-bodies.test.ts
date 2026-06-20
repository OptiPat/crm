import { describe, expect, it } from "vitest";
import { buildEditedHtmlEmailSendBodies } from "./etiquette-email-send-bodies";

describe("buildEditedHtmlEmailSendBodies", () => {
  it("conserve le HTML après édition", () => {
    const html =
      '<div dir="ltr"><div style="line-height:1.5;margin:0;padding:0">Bonjour <strong>Luc</strong></div><ul style="margin:0;padding-left:1.25em;line-height:1.5"><li style="margin:0;padding:0;line-height:1.5">Point clé</li></ul></div>';
    const { body, body_html } = buildEditedHtmlEmailSendBodies(html, null);
    expect(body_html).toContain("<strong>Luc</strong>");
    expect(body_html).toContain("<ul");
    expect(body).toContain("Luc");
    expect(body).toContain("Point clé");
  });
});
