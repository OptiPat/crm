import { describe, expect, it } from "vitest";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  filterFoyerRowsByStat,
  findFoyerIdForContact,
  searchFoyerRows,
  sortFoyerRows,
  type FoyerRow,
} from "@/lib/foyers/foyers-search";

function row(
  id: number,
  nom: string,
  membres: Contact[],
  patrimoine = 0,
  type = "COUPLE"
): FoyerRow {
  return {
    foyer: {
      id,
      nom,
      type_foyer: type,
      created_at: 0,
      updated_at: 0,
    } as Foyer,
    membres,
    patrimoineAvecMoi: patrimoine,
  };
}

const jean: Contact = {
  id: 1,
  prenom: "Jean",
  nom: "Dupont",
} as Contact;

const marie: Contact = {
  id: 2,
  prenom: "Marie",
  nom: "Martin",
} as Contact;

describe("foyers-search", () => {
  const rows = [
    row(10, "Dupont", [jean], 50000),
    row(20, "Martin", [marie], 10000, "FAMILLE"),
    row(30, "Vide", [], 0, "CELIBATAIRE"),
  ];

  it("searchFoyerRows filtre par membre et focus", () => {
    const result = searchFoyerRows("Marie", rows);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].foyer.id).toBe(20);
    expect(result.focusContactId).toBe(2);
  });

  it("sortFoyerRows par patrimoine", () => {
    const sorted = sortFoyerRows(rows, "patrimoine_desc");
    expect(sorted.map((r) => r.foyer.id)).toEqual([10, 20, 30]);
  });

  it("filterFoyerRowsByStat empty", () => {
    const filtered = filterFoyerRowsByStat(rows, "empty");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].foyer.nom).toBe("Vide");
  });

  it("findFoyerIdForContact", () => {
    expect(findFoyerIdForContact(1, rows)).toBe(10);
    expect(findFoyerIdForContact(99, rows)).toBeNull();
  });
});
