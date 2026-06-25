import { describe, expect, it } from "vitest";
import {
  buildProductPickerRows,
  nomInList,
  toggleNomInList,
} from "./product-target-filter";

describe("product-target-filter", () => {
  const investissements = [
    { type_produit: "SCPI", nom_produit: "Epargne Pierre" },
    { type_produit: "SCPI", nom_produit: "Epargne Pierre" },
    { type_produit: "ASSURANCE_VIE", nom_produit: "Comete" },
    { type_produit: "SCPI", nom_produit: "  " },
  ];

  it("agrège les noms avec compteur et labels de type", () => {
    const rows = buildProductPickerRows(investissements, []);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      nom_produit: "Epargne Pierre",
      usage_count: 2,
      type_labels: ["SCPI"],
    });
    expect(rows[1].nom_produit).toBe("Comete");
  });

  it("filtre par types sélectionnés", () => {
    const rows = buildProductPickerRows(investissements, ["ASSURANCE_VIE"]);
    expect(rows).toEqual([
      expect.objectContaining({ nom_produit: "Comete", usage_count: 1 }),
    ]);
  });

  it("nomInList est insensible à la casse", () => {
    expect(nomInList(["Epargne Pierre"], "epargne pierre")).toBe(true);
    expect(nomInList(["Epargne Pierre"], "Autre")).toBe(false);
  });

  it("toggleNomInList ajoute et retire sans doublon", () => {
    let list: string[] = [];
    const setList = (next: string[]) => {
      list = next;
    };
    toggleNomInList("Comete", list, setList);
    expect(list).toEqual(["Comete"]);
    toggleNomInList("comete", list, setList);
    expect(list).toEqual([]);
  });
});
