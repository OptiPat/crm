import { describe, expect, it } from "vitest";
import {
  buildSmsUrl,
  buildWhatsAppUrl,
  hasMessagingPhone,
  phoneDigitsForMessagingUrl,
} from "./birthday-outreach";

describe("birthday-outreach", () => {
  it("normalise un mobile FR 06…", () => {
    expect(phoneDigitsForMessagingUrl("06 12 34 56 78")).toBe("33612345678");
    expect(phoneDigitsForMessagingUrl("07 12 34 56 78")).toBe("33712345678");
  });

  it("normalise +33 mobile", () => {
    expect(phoneDigitsForMessagingUrl("+33 6 12 34 56 78")).toBe("33612345678");
  });

  it("rejette les fixes FR", () => {
    expect(phoneDigitsForMessagingUrl("01 23 45 67 89")).toBeNull();
    expect(phoneDigitsForMessagingUrl("+33 1 23 45 67 89")).toBeNull();
    expect(hasMessagingPhone("01 23 45 67 89")).toBe(false);
  });

  it("accepte les numéros internationaux (Tahiti, La Réunion, UK)", () => {
    expect(phoneDigitsForMessagingUrl("+689 87 12 34 56")).toBe("68987123456");
    expect(phoneDigitsForMessagingUrl("+262 692 12 34 56")).toBe("262692123456");
    expect(phoneDigitsForMessagingUrl("+44 7123 456789")).toBe("447123456789");
    expect(phoneDigitsForMessagingUrl("07123 456789")).toBe("447123456789");
  });

  it("renvoie null si numéro trop court", () => {
    expect(phoneDigitsForMessagingUrl("0612")).toBeNull();
    expect(hasMessagingPhone("")).toBe(false);
  });

  it("construit sms: et wa.me avec body encodé", () => {
    const body = "Salut Jean, joyeux anniversaire !";
    const tel = "0612345678";
    expect(buildSmsUrl(tel, body)).toBe(`sms:+33612345678?body=${encodeURIComponent(body)}`);
    expect(buildWhatsAppUrl(tel, body)).toBe(
      `https://wa.me/33612345678?text=${encodeURIComponent(body)}`
    );
  });
});
