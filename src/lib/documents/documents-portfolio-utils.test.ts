import { describe, expect, it } from "vitest";
import {
  getDocumentClientLabel,
  groupDocumentsPortfolio,
  sortDocumentsPortfolio,
} from "@/lib/documents/documents-portfolio-utils";
import type { Document } from "@/lib/api/tauri-documents";
import type { Contact } from "@/lib/api/tauri-contacts";

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    type_document: "AUTRE",
    nom_fichier: "a.pdf",
    chemin_fichier: "/a.pdf",
    taille_fichier: 1000,
    created_at: 100,
    updated_at: 100,
    ...overrides,
  };
}

const contacts: Record<number, Contact> = {
  1: { id: 1, nom: "DUPONT", prenom: "Jean", categorie: "CLIENT" } as Contact,
};

describe("documents-portfolio-utils", () => {
  it("tri par taille décroissante", () => {
    const sorted = sortDocumentsPortfolio(
      [doc({ id: 1, taille_fichier: 100 }), doc({ id: 2, taille_fichier: 5000 })],
      "size_desc",
      contacts
    );
    expect(sorted.map((d) => d.id)).toEqual([2, 1]);
  });

  it("libellé client sans fiche", () => {
    expect(getDocumentClientLabel(doc(), contacts)).toBe("Sans client lié");
    expect(getDocumentClientLabel(doc({ contact_id: 1 }), contacts)).toBe("DUPONT Jean");
  });

  it("regroupe par type", () => {
    const groups = groupDocumentsPortfolio(
      [
        doc({ id: 1, type_document: "PATRIMOINE" }),
        doc({ id: 2, type_document: "IDENTITE" }),
      ],
      "type",
      contacts
    );
    expect(groups).toHaveLength(2);
    expect(groups[0]?.key).toBe("IDENTITE");
  });

  it("regroupe par client avec sous-sections type si plusieurs types", () => {
    const groups = groupDocumentsPortfolio(
      [
        doc({ id: 1, type_document: "PATRIMOINE", contact_id: 1 }),
        doc({ id: 2, type_document: "IDENTITE", contact_id: 1 }),
      ],
      "client",
      contacts
    );
    expect(groups).toHaveLength(1);
    expect(groups[0]?.subgroups).toHaveLength(2);
  });

  it("ne fusionne pas deux contacts distincts au même nom", () => {
    const homonymes: Record<number, Contact> = {
      1: { id: 1, nom: "DUPONT", prenom: "Jean", categorie: "CLIENT" } as Contact,
      2: { id: 2, nom: "DUPONT", prenom: "Jean", categorie: "CLIENT" } as Contact,
    };
    const groups = groupDocumentsPortfolio(
      [
        doc({ id: 1, contact_id: 1 }),
        doc({ id: 2, contact_id: 2 }),
      ],
      "client",
      homonymes
    );
    expect(groups).toHaveLength(2);
  });
});
