import { describe, expect, it } from "vitest";
import {
  FILLEUL_QUALIFICATION_META,
  FILLEUL_TITRE_META,
  getFilleulQualificationLabel,
  getFilleulTitreLabel,
  parseFilleulQualification,
  parseFilleulTitre,
} from "./filleul-ranks";

describe("filleul-ranks", () => {
  it("parse les clés titre et qualification", () => {
    expect(parseFilleulTitre("SENIOR")).toBe("SENIOR");
    expect(parseFilleulTitre("INVALID")).toBeNull();
    expect(parseFilleulQualification("GALAXIE")).toBe("GALAXIE");
  });

  it("retourne les libellés FR", () => {
    expect(getFilleulTitreLabel("MAJOR")).toBe("Major");
    expect(getFilleulQualificationLabel("PLANETE")).toBe("Planète");
  });

  it("associe les icônes attendues", () => {
    expect(FILLEUL_TITRE_META.EXPERT.icon).toBe("stars-3-gold");
    expect(FILLEUL_TITRE_META.MANAGER.icon).toBe("inuksuk-red");
    expect(FILLEUL_QUALIFICATION_META.GALAXIE.icon).toBe("inuksuk-gold");
  });
});
