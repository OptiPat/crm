import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

function firstWord(value: string): string {
  return normalize(value).split(" ")[0] ?? "";
}

/**
 * Partenaire probable d'un produit Stellium :
 * 1. celui déjà renseigné sur les placements du portefeuille portant ce nom de produit
 *    (le plus fréquent) ;
 * 2. sinon le seul partenaire dont le nom commence comme le produit (« Corum » → « Corum Origin »).
 * `null` si rien d'univoque : le CGP choisit.
 */
export function guessPartenaireIdForProduct(
  productLabel: string,
  partenaires: readonly Pick<Partenaire, "id" | "raison_sociale">[],
  investissements: readonly Pick<Investissement, "nom_produit" | "partenaire_id">[]
): number | null {
  const product = normalize(productLabel);
  if (!product) return null;
  const known = new Set(partenaires.map((p) => p.id));

  const counts = new Map<number, number>();
  for (const inv of investissements) {
    const id = inv.partenaire_id;
    if (id == null || !known.has(id) || normalize(inv.nom_produit ?? "") !== product) continue;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  if (counts.size > 0) {
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    if (ranked.length === 1 || ranked[0][1] > ranked[1][1]) return ranked[0][0];
  }

  const word = firstWord(productLabel);
  if (word.length < 3) return null;
  const byName = partenaires.filter((p) => firstWord(p.raison_sociale) === word);
  return byName.length === 1 ? byName[0].id : null;
}
