export type InvestissementStatut = "ACTIF" | "CLOTURE";

export function isInvestissementActifEncours(
  inv: Pick<{ statut?: string }, "statut">
): boolean {
  return (inv.statut ?? "ACTIF") === "ACTIF";
}

export function isInvestissementCloture(
  inv: Pick<{ statut?: string }, "statut">
): boolean {
  return inv.statut === "CLOTURE";
}

export function getInvestissementStatutLabel(statut?: string): string {
  return statut === "CLOTURE" ? "Clôturé" : "Actif";
}

export type StatutFilter = "all" | "actifs" | "clotures";

export function matchesStatutFilter(
  statut: string | undefined,
  filter: StatutFilter
): boolean {
  if (filter === "all") return true;
  if (filter === "clotures") return statut === "CLOTURE";
  return (statut ?? "ACTIF") === "ACTIF";
}
