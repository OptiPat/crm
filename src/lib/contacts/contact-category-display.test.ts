import { describe, expect, it } from "vitest";
import {
  getClientRoleBadgeClass,
  getContactCategorieBadgeClass,
  getDisplayCategorieBadgeClass,
  getFilleulRoleBadgeClass,
} from "./contact-category-display";

describe("getClientRoleBadgeClass", () => {
  it("client en vert", () => {
    expect(getClientRoleBadgeClass("CLIENT")).toContain("green");
  });
});

describe("getFilleulRoleBadgeClass", () => {
  it("filleul désinscrit en gris neutre (pas rouge)", () => {
    expect(getFilleulRoleBadgeClass("FILLEUL_DESINSCRIT")).toContain("slate");
    expect(getFilleulRoleBadgeClass("FILLEUL_DESINSCRIT")).not.toContain("red");
  });
});

describe("getContactCategorieBadgeClass", () => {
  it("client standard", () => {
    expect(getContactCategorieBadgeClass("CLIENT")).toContain("green");
  });

  it("client + filleul : badge client (sans écrasement filleul)", () => {
    expect(getContactCategorieBadgeClass("CLIENT", "PROSPECT_FILLEUL")).toContain(
      "green"
    );
  });

  it("filleul seul", () => {
    expect(getContactCategorieBadgeClass("AUCUN", "FILLEUL_DESINSCRIT")).toContain(
      "slate"
    );
  });
});

describe("getDisplayCategorieBadgeClass", () => {
  it("retourne une classe connue ou muted", () => {
    expect(getDisplayCategorieBadgeClass("CLIENT")).toContain("green");
    expect(getDisplayCategorieBadgeClass("INCONNU")).toBe("bg-muted");
  });
});
