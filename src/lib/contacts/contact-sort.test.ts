import { describe, expect, it } from "vitest";
import { compareContactsAlphabetically } from "./contact-sort";

describe("compareContactsAlphabetically", () => {
  it("trie par nom puis prénom", () => {
    const contacts = [
      { nom: "MARTIN", prenom: "Paul" },
      { nom: "PLAZA", prenom: "Nicolas" },
      { nom: "MARTIN", prenom: "Alice" },
    ];
    expect([...contacts].sort(compareContactsAlphabetically)).toEqual([
      { nom: "MARTIN", prenom: "Alice" },
      { nom: "MARTIN", prenom: "Paul" },
      { nom: "PLAZA", prenom: "Nicolas" },
    ]);
  });
});
