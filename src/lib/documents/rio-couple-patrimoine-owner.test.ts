import { describe, expect, it } from "vitest";
import {
  buildCouplePatrimoineMemberOptions,
  ownerHintToKey,
  resolveCouplePatrimoineOwner,
} from "./rio-couple-patrimoine-owner";
import type { ExtractedData } from "@/lib/pdf/types";

describe("rio-couple-patrimoine-owner", () => {
  const extractedData: ExtractedData = {
    typeDocument: "RIO",
    raw: "",
    isCouple: true,
    prenom: "Claire",
    nom: "DURAND",
    conjoint: { prenom: "Guillaume", nom: "MOREAU" },
  };
  const memberIds: [number, number] = [10, 20];

  it("propose les noms des deux investisseurs et le foyer", () => {
    expect(buildCouplePatrimoineMemberOptions(extractedData, memberIds)).toEqual([
      { key: "10", contactId: 10, label: "Claire DURAND" },
      { key: "20", contactId: 20, label: "Guillaume MOREAU" },
      { key: "foyer", label: "Commun (foyer)" },
    ]);
  });

  it("mappe les hints parser vers les clés contact", () => {
    expect(ownerHintToKey("person1", memberIds)).toBe("10");
    expect(ownerHintToKey("person2", memberIds)).toBe("20");
    expect(ownerHintToKey("foyer", memberIds)).toBe("foyer");
  });

  it("résout le propriétaire CRM par clé", () => {
    expect(resolveCouplePatrimoineOwner("10", memberIds, 99)).toEqual({ contact_id: 10 });
    expect(resolveCouplePatrimoineOwner("foyer", memberIds, 99)).toEqual({ foyer_id: 99 });
  });

  it("rejette une clé détenteur invalide", () => {
    expect(() => resolveCouplePatrimoineOwner("999", memberIds, 99)).toThrow(
      /Clé détenteur RIO couple invalide/
    );
  });
});
