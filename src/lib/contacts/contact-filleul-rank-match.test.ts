import { describe, expect, it } from "vitest";
import {
  isDeFactoManagerFilleul,
  hasFilleulRankSubfilters,
} from "./contact-filleul-rank-match";
import { isDirectOrganisationFilleul } from "@/lib/organisation/organisation-tree";

describe("contact-filleul-rank-match", () => {
  it("isDeFactoManagerFilleul — titres Manager+ et qualifications élevées", () => {
    expect(isDeFactoManagerFilleul("MANAGER", null)).toBe(true);
    expect(isDeFactoManagerFilleul("SENIOR", null)).toBe(true);
    expect(isDeFactoManagerFilleul("JUNIOR", "PLANETE")).toBe(true);
    expect(isDeFactoManagerFilleul("JUNIOR", null)).toBe(false);
  });

  it("isDirectOrganisationFilleul — filleuls directs (niveau 1)", () => {
    expect(
      isDirectOrganisationFilleul(
        { filleul_categorie: "FILLEUL", parrain_id: 42 },
        42
      )
    ).toBe(true);
    expect(
      isDirectOrganisationFilleul(
        { filleul_categorie: "FILLEUL", parrain_id: 99 },
        42
      )
    ).toBe(false);
    expect(
      isDirectOrganisationFilleul(
        { filleul_categorie: "FILLEUL", parrain_id: 42 },
        null
      )
    ).toBe(false);
    // Senior direct reste niveau 1 (position réseau, pas rang)
    expect(
      isDirectOrganisationFilleul(
        { filleul_categorie: "FILLEUL", parrain_id: 42 },
        42
      )
    ).toBe(true);
  });

  it("hasFilleulRankSubfilters", () => {
    expect(hasFilleulRankSubfilters(["FILLEUL"])).toBe(false);
    expect(hasFilleulRankSubfilters(["FILLEUL", "FILLEUL_MANAGER"])).toBe(true);
  });
});
