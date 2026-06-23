import { describe, expect, it } from "vitest";
import {
  buildDistinctNomProduits,
  buildNomProduitSuggestions,
} from "./nom-produit-suggestions";

describe("buildNomProduitSuggestions", () => {
  const sample = [
    {
      type_produit: "ASSURANCE_VIE",
      partenaire_id: 1,
      nom_produit: "Primovie",
    },
    {
      type_produit: "ASSURANCE_VIE",
      partenaire_id: 1,
      nom_produit: "  primovie  ",
    },
    {
      type_produit: "ASSURANCE_VIE",
      partenaire_id: 2,
      nom_produit: "Autre contrat",
    },
    {
      type_produit: "PER",
      partenaire_id: 1,
      nom_produit: "PER Generali",
    },
    {
      type_produit: "ASSURANCE_VIE",
      partenaire_id: 1,
      nom_produit: "",
    },
  ];

  it("filtre par type et partenaire, trie par fréquence", () => {
    const allAv = buildNomProduitSuggestions(sample, "ASSURANCE_VIE");
    expect(allAv).toEqual([
      { nom_produit: "Primovie", usage_count: 2 },
      { nom_produit: "Autre contrat", usage_count: 1 },
    ]);

    const partner1 = buildNomProduitSuggestions(sample, "ASSURANCE_VIE", 1);
    expect(partner1).toEqual([{ nom_produit: "Primovie", usage_count: 2 }]);
  });

  it("retourne une liste vide sans historique", () => {
    expect(buildNomProduitSuggestions(sample, "SCPI")).toEqual([]);
  });
});
