import type { AgendaLink } from "@/lib/api/tauri-settings";
import { getAllEmailVariables } from "@/lib/emails/email-variable-registry";
import { STELLIUM_SCALAR_KEYS } from "@/lib/emails/stellium-perf-preview-vars";

const TOKEN_RE = /\{\{([^{}]*)\}\}/g;
/** Liens d'agenda : contrôlés à part (lien introuvable). */
const AGENDA_KEY_RE = /^(lien_agenda(?:_[a-z0-9_]+)?|lien_calendly)$/;

/**
 * Variables `{{…}}` du texte qui partiraient telles quelles dans l'email : faute de frappe
 * (`{{prénom}}`, `{{prenon}}`), majuscule (`{{Prenom}}`) ou espaces (`{{ nom }}`) — le
 * remplacement n'accepte que la forme exacte `{{prenom}}`.
 */
export function findUnknownTemplateVariables(text: string, agendaLinks: AgendaLink[] = []): string[] {
  const known = new Set<string>([
    ...getAllEmailVariables(agendaLinks).map((v) => v.key),
    ...STELLIUM_SCALAR_KEYS,
  ]);
  const unknown = new Set<string>();
  for (const match of text.matchAll(TOKEN_RE)) {
    const key = match[1];
    if (AGENDA_KEY_RE.test(key)) continue;
    if (!known.has(key)) unknown.add(match[0]);
  }
  return [...unknown];
}
