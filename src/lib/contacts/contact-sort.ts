/** Tri alphabétique nom puis prénom (liste Contacts). */
export function compareContactsAlphabetically(
  a: { nom: string; prenom: string },
  b: { nom: string; prenom: string }
): number {
  const byNom = a.nom.localeCompare(b.nom, "fr", { sensitivity: "base" });
  if (byNom !== 0) return byNom;
  return a.prenom.localeCompare(b.prenom, "fr", { sensitivity: "base" });
}
