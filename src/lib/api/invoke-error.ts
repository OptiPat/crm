/** Message d'erreur renvoyé par `invoke` Tauri (souvent une chaîne, pas une instance Error). */
export function invokeErrorMessage(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  return String(error);
}

/** Au-delà, la cause est jugée trop longue pour un toast. */
const MAX_CAUSE_LENGTH = 160;

/** Messages techniques (Rust, SQLite, réseau) : jamais montrés tels quels. */
const TECHNICAL_PATTERN =
  /\b(failed|error|invalid|unable|cannot|could not|not found|constraint|database|sqlite|sql|unique|foreign key|panicked|permission denied|os error|io error|timed? ?out|network|undefined|null|stack|column|row|query|thread|unwrap|serde|json|http|status code)\b/i;

/** Indices d'un message rédigé en français pour l'utilisateur. */
const FRENCH_PATTERN =
  /[àâçéèêëîïôûùüÿœ]|\b(le|la|les|des|du|une?|est|sont|pas|aucun|aucune|impossible|introuvable|veuillez|doit|déjà|ce|cette|vos?|votre)\b|\b[ldnqs]'/i;

function rawErrorText(error: unknown): string {
  if (typeof error === "string") return error;
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === "string") return message;
  }
  return error == null ? "" : String(error);
}

function isUserFacingCause(cause: string): boolean {
  if (!cause || cause.length > MAX_CAUSE_LENGTH || /[\r\n]/.test(cause)) return false;
  if (TECHNICAL_PATTERN.test(cause)) return false;
  return FRENCH_PATTERN.test(cause);
}

/**
 * Message d'erreur à afficher à l'utilisateur (toast, encadré).
 *
 * - `fallback` : phrase française décrivant l'action ratée (« Impossible d'enregistrer le contact »).
 * - Si l'erreur brute (rejet Tauri en chaîne, `Error`, objet `{ message }`) est une phrase
 *   française courte, elle est ajoutée comme cause : « Impossible d'enregistrer le contact : Email déjà utilisé ».
 * - Sinon (anglais technique : « Failed… », contrainte SQLite, « Database… », texte long) :
 *   `fallback` seul, et le détail part dans `console.error`.
 * - Si la cause reprend déjà le repli (même début, ou commence aussi par « Impossible ») : la cause seule.
 *
 * Ne pas traduire les messages côté Rust : du code teste leur texte anglais.
 */
export function userErrorMessage(error: unknown, fallback: string): string {
  const cause = rawErrorText(error)
    .trim()
    .replace(/^error\s*:\s*/i, "");
  if (isUserFacingCause(cause)) {
    const base = fallback.trim().replace(/[\s.!…:]+$/u, "");
    const baseLower = base.toLowerCase();
    const causeLower = cause.toLowerCase();
    if (baseLower.includes(causeLower.replace(/[\s.]+$/u, ""))) {
      return fallback;
    }
    // La cause dit déjà ce qui a raté (« Impossible d'enregistrer le contact : … ») : pas de doublon.
    if (causeLower.startsWith(baseLower) || (/^impossible\b/.test(baseLower) && /^impossible\b/.test(causeLower))) {
      return cause;
    }
    return `${base} : ${cause}`;
  }
  if (cause) console.error(`${fallback} —`, error);
  return fallback;
}
