/** Sous-filtres filleul pour règles auto (étiquettes, modèles email). */

export const FILLEUL_RANK_CATEGORY_MANAGER = "FILLEUL_MANAGER";
export const FILLEUL_RANK_CATEGORY_PREMIER_NIVEAU = "FILLEUL_PREMIER_NIVEAU";

export const FILLEUL_RANK_CATEGORIES = [
  FILLEUL_RANK_CATEGORY_MANAGER,
  FILLEUL_RANK_CATEGORY_PREMIER_NIVEAU,
] as const;

export type FilleulRankCategory = (typeof FILLEUL_RANK_CATEGORIES)[number];

export const FILLEUL_RANK_CATEGORY_OPTIONS: readonly {
  value: FilleulRankCategory;
  label: string;
}[] = [
  { value: FILLEUL_RANK_CATEGORY_MANAGER, label: "Manager" },
  { value: FILLEUL_RANK_CATEGORY_PREMIER_NIVEAU, label: "Premier niveau" },
];

const MANAGER_TITRE_IDS = new Set(["MANAGER", "SENIOR", "MAJOR", "EXPERT"]);
const MANAGER_QUALIFICATION_IDS = new Set([
  "MANAGER",
  "PLANETE",
  "ETOILE",
  "CONSTELLATION",
  "GALAXIE",
]);

/** Senior, Major, Expert et qualifications Planète+ sont de facto Manager. */
export function isDeFactoManagerFilleul(
  filleulTitre?: string | null,
  filleulQualification?: string | null
): boolean {
  if (filleulTitre != null && MANAGER_TITRE_IDS.has(filleulTitre)) return true;
  if (filleulQualification != null && MANAGER_QUALIFICATION_IDS.has(filleulQualification)) {
    return true;
  }
  return false;
}

export { isDirectOrganisationFilleul as isPremierNiveauFilleulForRule } from "@/lib/organisation/organisation-tree";

export function hasFilleulRankSubfilters(categories: readonly string[]): boolean {
  return categories.some((c) =>
    (FILLEUL_RANK_CATEGORIES as readonly string[]).includes(c)
  );
}

export function isFilleulCategoryActive(categories: readonly string[]): boolean {
  return (
    categories.includes("FILLEUL") ||
    categories.some((c) => (FILLEUL_RANK_CATEGORIES as readonly string[]).includes(c))
  );
}

/** Retire les sous-filtres rang de la sélection. */
export function stripFilleulRankCategories(categories: readonly string[]): string[] {
  return categories.filter(
    (c) => !(FILLEUL_RANK_CATEGORIES as readonly string[]).includes(c)
  );
}
