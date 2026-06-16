import type { BienImmobilier } from "../types";
import { extractBiensImmobiliers } from "../parsers/rio-parser-patrimoine";

function normalizeNom(nom: string): string {
  return nom
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

function findCreditSource(
  extracted: BienImmobilier[],
  bien: BienImmobilier
): BienImmobilier | undefined {
  const bienNorm = normalizeNom(bien.nom);
  return extracted.find((candidate) => {
    const candidateNorm = normalizeNom(candidate.nom);
    const candidateShort = normalizeNom(
      candidate.nom.split("-").pop()?.trim() ?? candidate.nom
    );
    return (
      candidateNorm === bienNorm ||
      candidateShort === bienNorm ||
      candidateNorm.includes(bienNorm) ||
      bienNorm.includes(candidateNorm)
    );
  });
}

/** Complète les crédits / loyers des biens Stellium via le parser patrimoine legacy. */
export function enrichBiensImmobiliersWithCredits(
  fullText: string,
  biens?: BienImmobilier[]
): void {
  if (!biens?.length) return;

  const extracted = extractBiensImmobiliers(fullText);
  for (const bien of biens) {
    const source = findCreditSource(extracted, bien);
    if (!source) continue;

    if (source.creditCRD != null) bien.creditCRD = source.creditCRD;
    if (source.mensualiteCredit != null) bien.mensualiteCredit = source.mensualiteCredit;
    if (source.echeanceAnnuelle != null) bien.echeanceAnnuelle = source.echeanceAnnuelle;
    if (source.dateFinCredit) bien.dateFinCredit = source.dateFinCredit;
    if (source.loyersAnnuels != null) bien.loyersAnnuels = source.loyersAnnuels;
  }
}
