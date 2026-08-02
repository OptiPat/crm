/** Valeurs de la liste déroulante `choixcontrat` du modèle PDF arbitrage AV. */

export const ARBITRAGE_AV_CHOIX_CONTRAT_OPTIONS = [
  "Cristalliance Avenir",
  "Cristalliance Evoluvie",
  "Fipavie Neo",
  "Target +",
  "Patrima + (Serenipierre)",
  "Cristalliance Vie First",
  "Fipavie Ingenierie",
  "Cristalliance Opportunités",
  "Fipavie Premium Evolution 2",
  "Cristalliance Vie / Cristalliance Vie 2",
  "Fipavie Premium / Fipavie Premium Evolution",
  "Cristalliance Horizon",
  "Cristalliance Privilège",
  "Fipavie Retraite Garantie",
] as const;

export type ArbitrageAvChoixContrat = (typeof ARBITRAGE_AV_CHOIX_CONTRAT_OPTIONS)[number];

function normalizeHaystack(...parts: Array<string | null | undefined>): string {
  return parts
    .filter(Boolean)
    .join(" ")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9+]+/g, " ")
    .trim();
}

function includesToken(haystack: string, token: string): boolean {
  return haystack.includes(token);
}

/** Résout le contrat PDF à partir du produit / partenaire CRM. */
export function resolveArbitrageAvChoixContrat(input: {
  nomProduit: string;
  partenaireNom?: string | null;
  numeroContrat?: string | null;
}): { value: ArbitrageAvChoixContrat | null; candidates: ArbitrageAvChoixContrat[] } {
  const haystack = normalizeHaystack(
    input.nomProduit,
    input.partenaireNom,
    input.numeroContrat
  );
  const matches = new Set<ArbitrageAvChoixContrat>();

  if (
    includesToken(haystack, "vie first") ||
    (includesToken(haystack, "apicil") && includesToken(haystack, "vie first"))
  ) {
    matches.add("Cristalliance Vie First");
  }
  if (
    includesToken(haystack, "cristalliance evoluvie") ||
    (includesToken(haystack, "apicil") && !includesToken(haystack, "vie first"))
  ) {
    matches.add("Cristalliance Evoluvie");
  }
  if (
    includesToken(haystack, "vie plus") ||
    includesToken(haystack, "suravenir") ||
    includesToken(haystack, "cristalliance avenir")
  ) {
    matches.add("Cristalliance Avenir");
  }

  const candidates = ARBITRAGE_AV_CHOIX_CONTRAT_OPTIONS.filter((opt) => matches.has(opt));
  if (candidates.length === 1) {
    return { value: candidates[0], candidates };
  }
  return { value: null, candidates };
}
