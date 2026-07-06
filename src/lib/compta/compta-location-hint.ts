/** Lieu Agenda sans code postal — complément ville utile en repli. */
export function locationNeedsCityHint(location: string): boolean {
  return !/\d{5}/.test(location.trim());
}

/** Cible Nominatim : ville seule (repli « Km manuel »). */
export function geocodeTargetFromCity(cityHint: string): string {
  return cityHint.trim();
}

/** Libellé destination enregistré à l'import. */
export function resolveComptaImportDestination(location: string, cityHint?: string): string {
  const loc = location.trim();
  const city = cityHint?.trim() ?? "";
  if (!city) return loc;
  if (loc.toLowerCase().includes(city.toLowerCase())) return loc;
  return `${loc} (${city})`;
}
