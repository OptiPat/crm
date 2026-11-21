/**
 * Ancienne CNI française (MRZ 2×36) : la MRZ ne contient pas de date d'expiration.
 * On l'estime à partir du n° de carte, dont les 4 premiers chiffres sont l'année (AA)
 * et le mois (MM) de délivrance, et de la date de naissance (âge à la délivrance) :
 * - majeur, carte délivrée à partir de janvier 2004 → 15 ans ;
 * - sinon (mineur, ou délivrance avant 2004) → 10 ans.
 * Le jour de délivrance n'est pas connu : on retient le 1er du mois (estimation prudente,
 * jamais plus tardive que la vraie date). Résultat à faire vérifier par l'utilisateur.
 */
export function estimateFrenchLegacyCniExpiry(
  documentNumber: string,
  dateNaissanceFr: string | undefined,
  now: Date = new Date()
): string | undefined {
  const match = /^(\d{2})(\d{2})\d{8}$/.exec(documentNumber);
  const birth = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(dateNaissanceFr ?? "");
  if (!match || !birth) return undefined;

  const yy = parseInt(match[1]!, 10);
  const month = parseInt(match[2]!, 10);
  if (month < 1 || month > 12) return undefined;

  const currentYy = now.getFullYear() % 100;
  const issueYear = yy <= currentYy ? 2000 + yy : 1900 + yy;
  // Ancien modèle délivré de 1988 à 2021.
  if (issueYear < 1988 || issueYear > 2021) return undefined;

  const birthDay = parseInt(birth[1]!, 10);
  const birthMonth = parseInt(birth[2]!, 10);
  const birthYear = parseInt(birth[3]!, 10);
  // Âge au 1er du mois de délivrance.
  let age = issueYear - birthYear;
  if (month < birthMonth || (month === birthMonth && birthDay > 1)) age -= 1;
  if (age < 0) return undefined;

  const adult = age >= 18;
  const years = adult && issueYear >= 2004 ? 15 : 10;
  return `01/${String(month).padStart(2, "0")}/${issueYear + years}`;
}
