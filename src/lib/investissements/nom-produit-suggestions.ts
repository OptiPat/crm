import type { Investissement } from "@/lib/api/tauri-investissements";

export interface NomProduitSuggestion {
  nom_produit: string;
  usage_count: number;
}

type InvestissementNomSource = Pick<
  Investissement,
  "type_produit" | "partenaire_id" | "nom_produit"
>;

/** Agrège l'historique local (même logique que la requête SQL Rust). */
export function buildNomProduitSuggestions(
  investissements: InvestissementNomSource[],
  typeProduit: string,
  partenaireId?: number | null,
  limit = 20
): NomProduitSuggestion[] {
  const counts = new Map<string, { nom_produit: string; usage_count: number }>();

  for (const inv of investissements) {
    if (inv.type_produit !== typeProduit) continue;
    if (partenaireId != null && inv.partenaire_id !== partenaireId) continue;

    const trimmed = inv.nom_produit.trim();
    if (!trimmed) continue;

    const key = trimmed.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.usage_count += 1;
    } else {
      counts.set(key, { nom_produit: trimmed, usage_count: 1 });
    }
  }

  return Array.from(counts.values())
    .sort(
      (a, b) =>
        b.usage_count - a.usage_count ||
        a.nom_produit.localeCompare(b.nom_produit, "fr", { sensitivity: "base" })
    )
    .slice(0, limit);
}
