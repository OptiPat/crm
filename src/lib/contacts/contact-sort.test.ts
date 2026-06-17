import { describe, expect, it } from "vitest";
import { compareContactsAlphabetically } from "./contact-sort";

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
});
