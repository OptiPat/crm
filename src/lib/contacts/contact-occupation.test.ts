import { describe, expect, it } from "vitest";
import { isRetiredProfession } from "@/lib/contacts/contact-occupation";

describe("contact-occupation", () => {
  it("détecte retraité dans la profession", () => {
    expect(isRetiredProfession("Retraité")).toBe(true);
    expect(isRetiredProfession("retraitée")).toBe(true);
    expect(isRetiredProfession("En retraite depuis 2020")).toBe(true);
    expect(isRetiredProfession("Cadre commercial")).toBe(false);
  });
});
