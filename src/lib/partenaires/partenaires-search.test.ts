import { describe, expect, it } from "vitest";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  buildPartenaireRows,
  filterPartenaireRowsByStat,
  findPartenaireIdForInvestissement,
  searchPartenaireRows,
  sortPartenaireRows,
  type PartenaireRow,
} from "@/lib/partenaires/partenaires-search";

function partenaire(id: number, nom: string, type = "ASSUREUR"): Partenaire {
  return {
    id,
    raison_sociale: nom,
    type_partenaire: type,
    created_at: 0,
    updated_at: 0,
  } as Partenaire;
}

function inv(id: number, partenaireId: number, nom: string): Investissement {
  return {
    id,
    partenaire_id: partenaireId,
    nom_produit: nom,
    type_produit: "ASSURANCE_VIE",
    montant_initial: 10000,
    origine: "MON_CONSEIL",
  } as Investissement;
}

describe("partenaires-search", () => {
  const rows: PartenaireRow[] = buildPartenaireRows(
    [
      partenaire(1, "AXA"),
      partenaire(2, "Corum", "SOCIETE_GESTION_SCPI"),
      partenaire(3, "Vide"),
    ],
    {
      1: { investissementCount: 1, encoursAvecMoi: 50000 },
      2: { investissementCount: 2, encoursAvecMoi: 20000 },
      3: { investissementCount: 0, encoursAvecMoi: 0 },
    },
    {
      1: [inv(10, 1, "Contrat Vie")],
      2: [inv(20, 2, "Corum Origin"), inv(21, 2, "Corum Europe")],
    }
  );

  it("searchPartenaireRows filtre par produit et focus", () => {
    const result = searchPartenaireRows("Corum Europe", rows);
    expect(result.rows).toHaveLength(1);
    expect(result.rows[0].partenaire.id).toBe(2);
    expect(result.focusInvestissementId).toBe(21);
  });

  it("sortPartenaireRows par encours", () => {
    const sorted = sortPartenaireRows(rows, "encours_desc");
    expect(sorted.map((r) => r.partenaire.id)).toEqual([1, 2, 3]);
  });

  it("filterPartenaireRowsByStat promoteur", () => {
    const rowsWithPromoteur = [
      ...rows,
      buildPartenaireRows(
        [partenaire(4, "Promo", "PROMOTEUR")],
        { 4: { investissementCount: 0, encoursAvecMoi: 0 } },
        {}
      )[0],
    ];
    const filtered = filterPartenaireRowsByStat(rowsWithPromoteur, "promoteur");
    expect(filtered).toHaveLength(1);
    expect(filtered[0].partenaire.type_partenaire).toBe("PROMOTEUR");
  });

  it("findPartenaireIdForInvestissement", () => {
    expect(findPartenaireIdForInvestissement(10, rows)).toBe(1);
    expect(findPartenaireIdForInvestissement(99, rows)).toBeNull();
  });
});
