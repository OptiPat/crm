import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  computeMergedContactFields,
  effectiveClientCategorie,
  pickMainContactId,
  scoreClientCategorie,
  scoreFilleulCategorie,
} from "./merge-duplicate-logic";

function dup(
  partial: Partial<Contact> & { id: number; categorie: string }
): Contact {
  return {
    nom: "TEST",
    prenom: "A",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("scoreClientCategorie", () => {
  it("CLIENT > PROSPECT > SUSPECT", () => {
    expect(scoreClientCategorie("CLIENT")).toBeGreaterThan(
      scoreClientCategorie("PROSPECT_CLIENT")
    );
    expect(scoreClientCategorie("PROSPECT_CLIENT")).toBeGreaterThan(
      scoreClientCategorie("SUSPECT_CLIENT")
    );
  });
});

describe("effectiveClientCategorie", () => {
  it("filleul legacy → AUCUN", () => {
    expect(effectiveClientCategorie("FILLEUL")).toBe("AUCUN");
  });
});

describe("pickMainContactId", () => {
  it("garde le plus petit id", () => {
    expect(
      pickMainContactId([
        dup({ id: 5, categorie: "CLIENT" }),
        dup({ id: 2, categorie: "SUSPECT_CLIENT" }),
      ])
    ).toBe(2);
  });
});

describe("computeMergedContactFields", () => {
  it("prend la meilleure catégorie client et filleul", () => {
    const merged = computeMergedContactFields([
      dup({
        id: 10,
        categorie: "SUSPECT_CLIENT",
        filleul_categorie: "SUSPECT_FILLEUL",
        date_dernier_contact: 100,
      }),
      dup({
        id: 5,
        categorie: "CLIENT",
        filleul_categorie: "FILLEUL",
        date_dernier_contact: 50,
        email: "a@b.fr",
      }),
    ]);
    expect(merged.categorie).toBe("CLIENT");
    expect(merged.filleul_categorie).toBe("FILLEUL");
    expect(merged.date_dernier_contact).toBe(100);
    expect(merged.email).toBe("a@b.fr");
  });

  it("fusionne les notes sans doublon", () => {
    const merged = computeMergedContactFields([
      dup({ id: 1, categorie: "CLIENT", notes: "Note A" }),
      dup({ id: 2, categorie: "CLIENT", notes: "Note B" }),
    ]);
    expect(merged.notes).toBe("Note A\n---\nNote B");
  });

  it("score filleul prospect < filleul inscrit", () => {
    expect(scoreFilleulCategorie("FILLEUL")).toBeGreaterThan(
      scoreFilleulCategorie("PROSPECT_FILLEUL")
    );
  });
});
