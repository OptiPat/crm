import { describe, expect, it } from "vitest";
import {
  getContactCategorieBadgeClass,
  getDisplayCategorieBadgeClass,
} from "./contact-category-display";

describe("getContactCategorieBadgeClass", () => {
  it("client standard", () => {
    expect(getContactCategorieBadgeClass("CLIENT")).toContain("green");
  });

  it("priorité filleul_categorie", () => {
    expect(
      getContactCategorieBadgeClass("CLIENT", "PROSPECT_FILLEUL")
    ).toContain("purple");
  });
});

describe("getDisplayCategorieBadgeClass", () => {
  it("retourne une classe connue ou muted", () => {
    expect(getDisplayCategorieBadgeClass("CLIENT")).toContain("green");
    expect(getDisplayCategorieBadgeClass("INCONNU")).toBe("bg-muted");
  });
});
