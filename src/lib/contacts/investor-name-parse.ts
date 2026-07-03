/** Parse « NOM Prénom » ou « NOM DE FAMILLE Jean-Pierre » (exports Stellium / Finzzle). */
export function parseNomCompletInvestisseur(
  full: string
): { nom: string; prenom: string } | null {
  const trimmed = full.trim();
  if (!trimmed || trimmed === "-") return null;
  const parts = trimmed.split(/\s+/).filter(Boolean);
  if (parts.length < 2) return null;
  if (parts.length === 2) {
    return { nom: parts[0]!, prenom: parts[1]! };
  }
  return {
    nom: parts.slice(0, -1).join(" "),
    prenom: parts[parts.length - 1]!,
  };
}
