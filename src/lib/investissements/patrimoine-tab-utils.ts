import type { Investissement } from "@/lib/api/tauri-investissements";
import { IMMOBILIER_TYPES } from "@/lib/investissements/investissement-display";
import { textMatchesSearch } from "@/lib/search-utils";

export type InvestissementWithOwner = Investissement & {
  _proprietaire?: string;
  _proprietaireId?: number | null;
};

export type PatrimoineOrigineFilter = "all" | "avec_moi" | "a_cote";

export type PatrimoineOwnerFilter = "all" | "self" | "foyer" | "members";

export interface PatrimoineStats {
  totalCentimes: number;
  avecMoiCentimes: number;
  aCoteCentimes: number;
  count: number;
  countAvecMoi: number;
  countACote: number;
}

export function isImmobilierType(typeProduit: string | undefined): boolean {
  if (!typeProduit) return false;
  return IMMOBILIER_TYPES.includes(
    typeProduit as (typeof IMMOBILIER_TYPES)[number]
  );
}

export function computePatrimoineStats(
  investissements: Investissement[]
): PatrimoineStats {
  let avecMoiCentimes = 0;
  let aCoteCentimes = 0;
  let countAvecMoi = 0;
  let countACote = 0;

  for (const inv of investissements) {
    const m = inv.montant_initial ?? 0;
    if (inv.origine === "MON_CONSEIL") {
      avecMoiCentimes += m;
      countAvecMoi += 1;
    } else {
      aCoteCentimes += m;
      countACote += 1;
    }
  }

  return {
    totalCentimes: avecMoiCentimes + aCoteCentimes,
    avecMoiCentimes,
    aCoteCentimes,
    count: investissements.length,
    countAvecMoi,
    countACote,
  };
}

export function filterByOrigine(
  investissements: Investissement[],
  filter: PatrimoineOrigineFilter
): Investissement[] {
  if (filter === "avec_moi") {
    return investissements.filter((i) => i.origine === "MON_CONSEIL");
  }
  if (filter === "a_cote") {
    return investissements.filter((i) => i.origine !== "MON_CONSEIL");
  }
  return investissements;
}

export function filterByOwner(
  investissements: InvestissementWithOwner[],
  filter: PatrimoineOwnerFilter,
  contactId: number
): InvestissementWithOwner[] {
  if (filter === "all") return investissements;
  if (filter === "foyer") {
    return investissements.filter((i) => i._proprietaire === "Foyer");
  }
  if (filter === "members") {
    return investissements.filter(
      (i) =>
        i._proprietaire &&
        i._proprietaire !== "Foyer" &&
        i._proprietaireId !== contactId
    );
  }
  return investissements.filter(
    (i) =>
      i._proprietaireId === contactId ||
      (i._proprietaire == null && i.contact_id === contactId)
  );
}

export function filterPatrimoineSearch(
  investissements: InvestissementWithOwner[],
  query: string,
  getPartenaireNom: (id?: number) => string | null
): InvestissementWithOwner[] {
  if (!query.trim()) return investissements;
  return investissements.filter((inv) =>
    textMatchesSearch(
      query,
      inv.nom_produit,
      inv.type_produit,
      inv.notes,
      inv._proprietaire,
      getPartenaireNom(inv.partenaire_id)
    )
  );
}

/** Fusionne patrimoine personnel + foyer (sans doublons d’id). */
export function mergeContactPatrimoineRows(
  contactId: number,
  contactLabel: string,
  own: Investissement[],
  foyerInvs: Investissement[],
  memberRows: InvestissementWithOwner[]
): InvestissementWithOwner[] {
  let list: InvestissementWithOwner[] = own.map((inv) => ({
    ...inv,
    _proprietaire: contactLabel,
    _proprietaireId: contactId,
  }));

  for (const inv of foyerInvs) {
    list.push({
      ...inv,
      _proprietaire: "Foyer",
      _proprietaireId: null,
    });
  }

  list.push(...memberRows);

  const byId = new Map<number, InvestissementWithOwner>();
  for (const inv of list) {
    const prev = byId.get(inv.id);
    if (!prev) {
      byId.set(inv.id, inv);
      continue;
    }
    const prefer =
      inv._proprietaireId === contactId ||
      (inv.contact_id === contactId && prev._proprietaireId !== contactId);
    if (prefer) byId.set(inv.id, inv);
  }

  return Array.from(byId.values()).sort(
    (a, b) => (b.date_souscription ?? 0) - (a.date_souscription ?? 0)
  );
}

export function groupPatrimoineByCategory(
  investissements: InvestissementWithOwner[]
): {
  immobilier: InvestissementWithOwner[];
  financier: InvestissementWithOwner[];
} {
  const immobilier: InvestissementWithOwner[] = [];
  const financier: InvestissementWithOwner[] = [];
  for (const inv of investissements) {
    if (isImmobilierType(inv.type_produit)) {
      immobilier.push(inv);
    } else {
      financier.push(inv);
    }
  }
  const byAmount = (a: Investissement, b: Investissement) =>
    (b.montant_initial ?? 0) - (a.montant_initial ?? 0);
  immobilier.sort(byAmount);
  financier.sort(byAmount);
  return { immobilier, financier };
}
