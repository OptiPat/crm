import { describe, expect, it } from "vitest";
import { formatEstimatedSendDuration, newsletterMailboxLabel } from "./newsletter-send-labels";

describe("newsletterMailboxLabel", () => {
  it("nomme le fournisseur connecté", () => {
    expect(newsletterMailboxLabel("google")).toBe("Gmail");
    expect(newsletterMailboxLabel("Microsoft")).toBe("Outlook");
  });
  it("reste neutre sinon", () => {
    expect(newsletterMailboxLabel(null)).toBe("votre boîte mail");
    expect(newsletterMailboxLabel("autre")).toBe("votre boîte mail");
  });
});

describe("formatEstimatedSendDuration", () => {
  it("moins d'une minute", () => {
    expect(formatEstimatedSendDuration(5, 3000)).toBe("moins d'une minute");
    expect(formatEstimatedSendDuration(0, 3000)).toBe("moins d'une minute");
  });
  it("arrondit à la minute supérieure", () => {
    expect(formatEstimatedSendDuration(200, 3000)).toBe("environ 10 min");
    expect(formatEstimatedSendDuration(21, 3000)).toBe("environ 2 min");
  });
  it("passe en heures", () => {
    expect(formatEstimatedSendDuration(1200, 3000)).toBe("environ 1 h");
    expect(formatEstimatedSendDuration(1300, 3000)).toBe("environ 1 h 05");
  });
});
