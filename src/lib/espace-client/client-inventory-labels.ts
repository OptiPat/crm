import { formatNomProduit } from "@/lib/investissements/investissement-display";

export interface InventoryRowLabels {
  title: string;
  subtitle: string | null;
}

function fold(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[-–—]/g, " ")
    .replace(/\s+/g, " ");
}

function sameLabel(a: string, b: string): boolean {
  return fold(a) === fold(b);
}

/**
 * Ligne d'inventaire côté client : le nom que le client reconnaît en titre,
 * le type et le partenaire en légende, sans répéter ce qui est déjà le titre.
 * Un nom qui n'est que le type (souvent « PER », « Assurance-vie ») n'est pas
 * un nom de produit.
 */
export function inventoryRowLabels(input: {
  typeProduit: string;
  nomProduit?: string | null;
  partenaireNom?: string | null;
}): InventoryRowLabels {
  const typeLabel = formatNomProduit(input.typeProduit) || input.typeProduit;
  const rawNom = input.nomProduit?.trim() ?? "";
  const nomLooksLikeType =
    !rawNom ||
    sameLabel(rawNom, typeLabel) ||
    sameLabel(formatNomProduit(rawNom), typeLabel);

  const title = nomLooksLikeType ? typeLabel : rawNom;

  const parts: string[] = [];
  if (!nomLooksLikeType && !sameLabel(typeLabel, title)) {
    parts.push(typeLabel);
  }
  const partner = input.partenaireNom?.trim() ?? "";
  if (partner && !sameLabel(partner, title)) {
    parts.push(partner);
  }

  return { title, subtitle: parts.length > 0 ? parts.join(" · ") : null };
}
