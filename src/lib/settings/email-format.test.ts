import { describe, expect, it } from "vitest";
import { looksLikeEmail } from "./email-format";

describe("looksLikeEmail", () => {
  it("accepte une adresse classique", () => {
    expect(looksLikeEmail("jean@cabinet.fr")).toBe(true);
    expect(looksLikeEmail("  prenom.nom+crm@sous.domaine.com ")).toBe(true);
  });
  it("refuse les saisies incomplètes", () => {
    expect(looksLikeEmail("")).toBe(false);
    expect(looksLikeEmail("jean@")).toBe(false);
    expect(looksLikeEmail("jean@cabinet")).toBe(false);
    expect(looksLikeEmail("jean cabinet.fr")).toBe(false);
    expect(looksLikeEmail("je an@cabinet.fr")).toBe(false);
  });
});
