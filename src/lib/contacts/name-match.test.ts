import { describe, expect, it } from "vitest";
import {
  contactNameKey,
  contactNameKeyCanonical,
  findContactByNameKeyWithSwap,
  normalizeContactName,
} from "./name-match";

describe("normalizeContactName", () => {
  it("ignore casse et accents", () => {
    expect(normalizeContactName("  Élisabeth  ")).toBe("ELISABETH");
    expect(normalizeContactName("François")).toBe("FRANCOIS");
  });
});

describe("contactNameKey", () => {
  it("produit la même clé pour variantes", () => {
    expect(contactNameKey("Arnaud", "Jean-Marc")).toBe(
      contactNameKey("NOM1", "jean-marc")
    );
  });
});

describe("findContactByNameKeyWithSwap", () => {
  const contacts = [{ id: 1, nom: "NOM1", prenom: "Jean" }];

  it("trouve avec nom/prénom inversés", () => {
    expect(findContactByNameKeyWithSwap(contacts, "Jean", "NOM1")?.id).toBe(1);
  });
});

describe("contactNameKeyCanonical", () => {
  it("est indépendant de l'ordre", () => {
    expect(contactNameKeyCanonical("NOM1", "Jean")).toBe(
      contactNameKeyCanonical("Jean", "NOM1")
    );
  });
});
