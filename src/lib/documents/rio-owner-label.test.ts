import { describe, expect, it } from "vitest";
import { rioOwnerDisplayLabel } from "./rio-owner-label";

const couple = {
  isCouple: true,
  prenom: "Lea",
  nom: "BERNARD",
  conjoint: { prenom: "Luc", nom: "LEGRAND" },
};

describe("rioOwnerDisplayLabel", () => {
  it("nomme chaque détenteur du couple", () => {
    expect(rioOwnerDisplayLabel(couple, "person1")).toBe("Lea BERNARD");
    expect(rioOwnerDisplayLabel(couple, "person2")).toBe("Luc LEGRAND");
    expect(rioOwnerDisplayLabel(couple, "foyer")).toBe("Commun");
  });

  it("n'affiche rien hors couple", () => {
    expect(rioOwnerDisplayLabel({ prenom: "Paul", nom: "LEGRAND" }, "person1")).toBeNull();
  });
});
