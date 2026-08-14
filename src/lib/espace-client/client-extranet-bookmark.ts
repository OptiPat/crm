import { getPatrimoineCategorie } from "@/lib/patrimoine/categories";

const URL_MAX = 500;

/**
 * Lien vers l'espace en ligne du contrat (AV, SCPI, livret…).
 * Jamais d'identifiant ni de mot de passe — uniquement une adresse https.
 */
export function isExtranetBookmarkEligible(
  typeProduit: string,
  estScpi?: boolean
): boolean {
  if (estScpi) return true;
  const cat = getPatrimoineCategorie(typeProduit);
  return (
    cat === "SCPI" ||
    cat === "Placements financiers" ||
    cat === "Épargne bancaire"
  );
}

/**
 * `null` = champ vide (effacer). `"invalid"` = saisie refusée.
 * Un hôte sans schéma est préfixé `https://`.
 */
export function normalizeExtranetBookmarkUrl(
  raw: string
): string | null | "invalid" {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > URL_MAX) return "invalid";
  if (/\s/.test(trimmed)) return "invalid";

  const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed)
    ? trimmed
    : `https://${trimmed}`;

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    return "invalid";
  }
  if (parsed.protocol !== "https:") return "invalid";
  if (parsed.username || parsed.password) return "invalid";
  if (!parsed.hostname || parsed.hostname.length < 3) return "invalid";
  if (!parsed.hostname.includes(".")) return "invalid";

  const href = parsed.href;
  if (href.length > URL_MAX) return "invalid";
  return href;
}
