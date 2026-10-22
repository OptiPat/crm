/** Format d'adresse email plausible (contrôle de saisie, pas une vérification d'existence). */
export function looksLikeEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value.trim());
}
