import type { ContratFinancier, ExtractedData, RioCoupleOwnerHint } from "../types";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

/** Mappe une catégorie d'actif Stellium vers le type_produit CRM. */
export function mapActifCategoryToProductType(category: string): string | null {
  const lower = category.toLowerCase();
  if (lower.includes("assurance vie")) return "ASSURANCE_VIE";
  if (lower.includes("compte courant")) return "EPARGNE_BANCAIRE";
  if (lower.includes("compte sur livret") || lower === "csl") return "CSL";
  if (lower.includes("livret")) return "LIVRET_A";
  if (lower.includes("ldd") || lower.includes("ldds")) return "LDDS";
  if (lower === "pel") return "PEL";
  if (lower === "cel") return "CEL";
  if (lower === "per") return "PER";
  if (lower === "perp") return "PERP";
  if (lower === "pea") return "PEA";
  if (lower.includes("compte titres")) return "COMPTE_TITRE";
  if (lower === "scpi") return "SCPI";
  return null;
}

export function isImmoActifCategory(category: string): boolean {
  const lower = category.toLowerCase();
  // « Livret classique » est de l'épargne, pas de l'immobilier « Classique ».
  if (lower.includes("livret")) return false;
  return (
    lower.includes("résidence") ||
    lower.includes("residence") ||
    lower.includes("classique") ||
    lower.includes("pinel") ||
    lower.includes("lmnp") ||
    lower.includes("lmp") ||
    lower.includes("denormandie") ||
    lower.includes("malraux")
  );
}

export function appendContratFinancier(
  data: ExtractedData,
  category: string,
  nom: string,
  montant: number,
  rioOwnerHint?: RioCoupleOwnerHint
): void {
  const type = mapActifCategoryToProductType(category);
  if (!type || montant <= 0) return;

  const label = nom.trim() || category.trim();

  if (!data.contratsFinanciers) {
    data.contratsFinanciers = [];
  }

  // Vrai doublon (même ligne relue) = type + nom + montant identiques. On ne
  // déduplique PAS sur le seul couple type/nom : les deux conjoints peuvent
  // détenir un contrat homonyme (ex. « Livret A - LA » des deux membres).
  const isDuplicate = data.contratsFinanciers.some(
    (c) =>
      c.type === type &&
      c.nom.toLowerCase() === label.toLowerCase() &&
      c.montant === montant
  );
  if (isDuplicate) return;

  const baseId = `fin-${slugify(`${type}-${label}`)}`;
  let id = baseId;
  let suffix = 2;
  while (data.contratsFinanciers.some((c) => c.id === id)) {
    id = `${baseId}-${suffix++}`;
  }

  const contrat: ContratFinancier = {
    id,
    type,
    nom: label,
    montant,
    ...(rioOwnerHint ? { rioOwnerHint } : {}),
    autoOrigine: ["LIVRET_A", "LDDS", "EPARGNE_BANCAIRE", "PEL", "CEL", "CSL"].includes(type)
      ? "EXISTANT_CLIENT"
      : undefined,
  };
  data.contratsFinanciers.push(contrat);
}

/** Totaux agrégés (rétrocompat tests / preview). */
export function applyFinancialProductAggregate(
  data: ExtractedData,
  category: string,
  montant: number
): void {
  const lower = category.toLowerCase();
  if (lower.includes("assurance vie")) {
    data.assuranceVie = (data.assuranceVie ?? 0) + montant;
    return;
  }
  if (lower.includes("compte courant")) {
    data.compteCourant = (data.compteCourant ?? 0) + montant;
    return;
  }
  if (lower.includes("compte sur livret") || lower === "csl") {
    data.csl = (data.csl ?? 0) + montant;
    return;
  }
  if (lower.includes("livret")) {
    data.livretA = (data.livretA ?? 0) + montant;
    return;
  }
  if (lower.includes("ldd") || lower.includes("ldds")) {
    data.ldd = (data.ldd ?? 0) + montant;
    return;
  }
  if (lower === "pel") {
    data.pel = (data.pel ?? 0) + montant;
    return;
  }
  if (lower === "cel") {
    data.cel = (data.cel ?? 0) + montant;
    return;
  }
  if (lower === "per") {
    data.per = (data.per ?? 0) + montant;
    return;
  }
  if (lower === "perp") {
    data.perp = (data.perp ?? 0) + montant;
    return;
  }
  if (lower === "pea") {
    data.pea = (data.pea ?? 0) + montant;
    return;
  }
  if (lower.includes("compte titres")) {
    data.compteTitres = (data.compteTitres ?? 0) + montant;
    return;
  }
  if (lower === "scpi") {
    data.scpi = (data.scpi ?? 0) + montant;
  }
}

export function registerFinancialActifLine(
  data: ExtractedData,
  category: string,
  nom: string,
  montant: number,
  rioOwnerHint?: RioCoupleOwnerHint
): void {
  appendContratFinancier(data, category, nom, montant, rioOwnerHint);
  applyFinancialProductAggregate(data, category, montant);
}

export function hasEpargneBancaireDetail(data: ExtractedData): boolean {
  return (
    (data.livretA ?? 0) > 0 ||
    (data.compteCourant ?? 0) > 0 ||
    (data.ldd ?? 0) > 0 ||
    (data.pel ?? 0) > 0 ||
    (data.cel ?? 0) > 0 ||
    (data.csl ?? 0) > 0 ||
    Boolean(
      data.contratsFinanciers?.some((c) =>
        ["LIVRET_A", "EPARGNE_BANCAIRE", "LDDS", "PEL", "CEL", "CSL"].includes(c.type)
      )
    )
  );
}
