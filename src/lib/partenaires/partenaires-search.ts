import { textMatchesSearch } from "@/lib/search-utils";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { PartenaireListMeta } from "@/components/partenaires/PartenaireSummaryCard";
import { matchesPartenaireTypeFilter } from "@/lib/partenaires/partenaire-type-filter";

export type PartenaireSortId = "encours_desc" | "produits_desc" | "name_asc";

export type PartenaireStatFilter =
  | "promoteur"
  | "with_encours"
  | "assureur"
  | "scpi";

export type PartenaireRow = {
  partenaire: Partenaire;
  meta: PartenaireListMeta;
  investissements: Investissement[];
};

export type PartenaireSearchResult = {
  rows: PartenaireRow[];
  focusInvestissementId: number | null;
};

export function buildPartenaireRows(
  partenaires: Partenaire[],
  metaParId: Record<number, PartenaireListMeta>,
  byPartenaireId: Record<number, Investissement[]>
): PartenaireRow[] {
  return partenaires.map((partenaire) => ({
    partenaire,
    meta: metaParId[partenaire.id] ?? {
      investissementCount: 0,
      encoursAvecMoi: 0,
    },
    investissements: byPartenaireId[partenaire.id] ?? [],
  }));
}

export function sortPartenaireRows(
  rows: PartenaireRow[],
  sortId: PartenaireSortId
): PartenaireRow[] {
  const copy = [...rows];
  copy.sort((a, b) => {
    switch (sortId) {
      case "produits_desc":
        return b.meta.investissementCount - a.meta.investissementCount;
      case "name_asc":
        return a.partenaire.raison_sociale.localeCompare(
          b.partenaire.raison_sociale,
          "fr"
        );
      case "encours_desc":
      default:
        return b.meta.encoursAvecMoi - a.meta.encoursAvecMoi;
    }
  });
  return copy;
}

export function filterPartenaireRowsByStat(
  rows: PartenaireRow[],
  statFilter: PartenaireStatFilter | null
): PartenaireRow[] {
  if (statFilter == null) return rows;
  switch (statFilter) {
    case "promoteur":
      return rows.filter((r) => r.partenaire.type_partenaire === "PROMOTEUR");
    case "with_encours":
      return rows.filter((r) => r.meta.encoursAvecMoi > 0);
    case "assureur":
      return rows.filter((r) => r.partenaire.type_partenaire === "ASSUREUR");
    case "scpi":
      return rows.filter(
        (r) =>
          r.partenaire.type_partenaire === "SOCIETE_GESTION_SCPI" ||
          r.partenaire.type_partenaire === "SOCIETE_GESTION" ||
          r.partenaire.type_partenaire === "SOCIETE_GESTION_FIP"
      );
    default:
      return rows;
  }
}

export function filterPartenaireRowsByType(
  rows: PartenaireRow[],
  typeFilter: string
): PartenaireRow[] {
  if (typeFilter === "ALL") return rows;
  return rows.filter((r) =>
    matchesPartenaireTypeFilter(r.partenaire.type_partenaire, typeFilter)
  );
}

/** Recherche partenaire ou produit lié ; surbrillance du produit si match produit. */
export function searchPartenaireRows(
  query: string,
  rows: PartenaireRow[]
): PartenaireSearchResult {
  const q = query.trim();
  if (!q) {
    return { rows, focusInvestissementId: null };
  }

  const matched: PartenaireRow[] = [];
  let focusInvestissementId: number | null = null;

  for (const row of rows) {
    const p = row.partenaire;
    const partnerMatch = textMatchesSearch(
      q,
      p.raison_sociale,
      p.nom_contact,
      p.prenom_contact,
      p.email,
      p.telephone,
      p.ville,
      p.specialite
    );

    let productMatch = false;
    for (const inv of row.investissements) {
      if (
        textMatchesSearch(
          q,
          inv.nom_produit,
          inv.type_produit
        )
      ) {
        productMatch = true;
        if (focusInvestissementId == null && inv.id != null) {
          focusInvestissementId = inv.id;
        }
      }
    }

    if (partnerMatch || productMatch) {
      matched.push(row);
    }
  }

  return { rows: matched, focusInvestissementId };
}

export function findPartenaireIdForInvestissement(
  investissementId: number,
  rows: PartenaireRow[]
): number | null {
  for (const row of rows) {
    if (row.investissements.some((inv) => inv.id === investissementId)) {
      return row.partenaire.id;
    }
  }
  return null;
}
