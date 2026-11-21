/**
 * Ligne d'état du rapport Coach (en-tête Veille fonds) : date lisible, nombre de fonds
 * analysés, et alerte si le nombre de favoris a changé depuis le rapport.
 */
export function coachReportStatus(options: {
  generatedAt: number;
  favoriteCount: number;
  currentFavorites: number;
}): { label: string; staleHint: string | null } {
  const { generatedAt, favoriteCount, currentFavorites } = options;
  const date = new Date(generatedAt * 1000).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const fonds = `${favoriteCount} fonds`;
  const label = `Rapport Coach du ${date} · ${fonds}`;
  if (currentFavorites === favoriteCount) return { label, staleHint: null };
  return {
    label,
    staleHint: `Vos favoris ont changé depuis (${currentFavorites} aujourd'hui) : mettez le rapport à jour.`,
  };
}
