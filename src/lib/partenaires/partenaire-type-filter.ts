/** Filtre type toolbar (SCPI inclut legacy SOCIETE_GESTION). */
export function matchesPartenaireTypeFilter(
  typePartenaire: string,
  typeFilter: string
): boolean {
  if (typeFilter === "ALL") return true;
  if (typeFilter === "SOCIETE_GESTION_SCPI") {
    return (
      typePartenaire === "SOCIETE_GESTION_SCPI" ||
      typePartenaire === "SOCIETE_GESTION"
    );
  }
  return typePartenaire === typeFilter;
}
