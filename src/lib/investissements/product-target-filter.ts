import { INVESTISSEMENT_TYPE_GROUPS } from "@/lib/etiquettes/etiquette-investissement-types";

export type ProductPickerRow = {
  nom_produit: string;
  usage_count: number;
  type_labels: string[];
};

export const TYPE_LABEL_BY_VALUE = Object.fromEntries(
  INVESTISSEMENT_TYPE_GROUPS.flatMap((g) => g.types.map((t) => [t.value, t.label]))
) as Record<string, string>;

export function nomInList(list: string[], nom: string): boolean {
  return list.some((n) => n.toLowerCase() === nom.toLowerCase());
}

export function toggleNomInList(
  nom: string,
  list: string[],
  setList: (next: string[]) => void
) {
  if (nomInList(list, nom)) {
    setList(list.filter((n) => n.toLowerCase() !== nom.toLowerCase()));
  } else {
    setList([...list, nom]);
  }
}

export function buildProductPickerRows(
  investissements: { type_produit: string; nom_produit: string }[],
  typeFilters: string[]
): ProductPickerRow[] {
  const typeSet = typeFilters.length > 0 ? new Set(typeFilters) : null;
  const byNom = new Map<string, { nom_produit: string; usage_count: number; types: Set<string> }>();

  for (const inv of investissements) {
    if (typeSet && !typeSet.has(inv.type_produit)) continue;
    const trimmed = inv.nom_produit.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    const existing = byNom.get(key);
    if (existing) {
      existing.usage_count += 1;
      existing.types.add(inv.type_produit);
    } else {
      byNom.set(key, {
        nom_produit: trimmed,
        usage_count: 1,
        types: new Set([inv.type_produit]),
      });
    }
  }

  return Array.from(byNom.values())
    .map(({ nom_produit, usage_count, types }) => ({
      nom_produit,
      usage_count,
      type_labels: [...types]
        .map((t) => TYPE_LABEL_BY_VALUE[t] ?? t)
        .sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" })),
    }))
    .sort(
      (a, b) =>
        b.usage_count - a.usage_count ||
        a.nom_produit.localeCompare(b.nom_produit, "fr", { sensitivity: "base" })
    );
}
