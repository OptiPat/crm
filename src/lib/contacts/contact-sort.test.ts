import { describe, expect, it } from "vitest";
import { compareContactsAlphabetically, sortContactsAlphabetically } from "./contact-sort";

describe("compareContactsAlphabetically", () => {
  it("trie par nom puis prénom", () => {
    const contacts = [
      { nom: "MARTIN", prenom: "Paul" },
      { nom: "DUPONT", prenom: "Jean" },
      { nom: "MARTIN", prenom: "Alice" },
    ];
    expect([...contacts].sort(compareContactsAlphabetically)).toEqual([
      { nom: "DUPONT", prenom: "Jean" },
      { nom: "MARTIN", prenom: "Alice" },
      { nom: "MARTIN", prenom: "Paul" },
    ]);
  });

  it("sortContactsAlphabetically renvoie une copie triée", () => {
    const input = [
      { nom: "MARTIN", prenom: "Paul", id: 2 },
      { nom: "DUPONT", prenom: "Jean", id: 1 },
    ];
    const sorted = sortContactsAlphabetically(input);
    expect(sorted.map((c) => c.id)).toEqual([1, 2]);
    expect(input.map((c) => c.id)).toEqual([2, 1]);
  });
});
