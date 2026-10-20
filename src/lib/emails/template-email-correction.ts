import type { AgendaLink, CgpConfig } from "@/lib/api/tauri-settings";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import type { TemplateCorrectionTarget } from "@/lib/api/tauri-template-correction";

export const DEFAULT_CORRECTION_TEXT_TU =
  "Bonjour {prenom},\n\nPetit oubli dans mon mail d'hier : voici le bon lien pour réserver ton créneau 👉 {lien}\n\nDésolé pour le doublon !";
export const DEFAULT_CORRECTION_TEXT_VOUS =
  "Bonjour {prenom},\n\nPetit oubli dans mon mail d'hier : voici le bon lien pour réserver votre créneau 👉 {lien}\n\nDésolé pour le doublon !";

/** Lien d'agenda actuel utilisé par le modèle (`{{lien_agenda_<id>}}` ou `{{lien_agenda}}`). */
export function resolveTemplateAgendaUrl(
  template: Pick<TemplateEmail, "corps" | "variables" | "agenda_link_id">,
  cgp: Pick<CgpConfig, "agenda_links" | "lien_agenda"> | null | undefined
): string {
  const links: AgendaLink[] = cgp?.agenda_links ?? [];
  const text = `${template.corps ?? ""} ${template.variables ?? ""}`;
  const match = text.match(/\{\{\s*lien_agenda_([a-z0-9_]+)\s*\}\}/i);
  const id = match?.[1] ?? template.agenda_link_id ?? null;
  if (id) {
    const found = links.find((l) => l.id === id);
    if (found?.url) return found.url;
  }
  return links[0]?.url ?? cgp?.lien_agenda ?? "";
}

export function isTutoiement(target: Pick<TemplateCorrectionTarget, "contact_registre">): boolean {
  return (target.contact_registre ?? "").trim().toUpperCase() === "TU";
}

/** Objet de réponse dans la même conversation : « Re: » + objet d'origine (une seule fois). */
export function correctionSubject(sentSubject: string | null | undefined): string {
  const s = (sentSubject ?? "").trim();
  if (!s) return "Re:";
  return /^re\s*:/i.test(s) ? s : `Re: ${s}`;
}

/** Texte final pour un destinataire : prénom et lien remplacés. */
export function renderCorrectionText(
  text: string,
  target: Pick<TemplateCorrectionTarget, "contact_prenom">,
  link: string
): string {
  // Prénom complet, comme dans le mail d'origine (« Jean Marc », « Anne-Cécile »).
  const prenom = target.contact_prenom.trim().replace(/\s+/g, " ");
  return text.replace(/\{prenom\}/g, prenom).replace(/\{lien\}/g, link.trim()).trim();
}

/** Destinataires réellement à envoyer : email présent et pas déjà corrigé. */
export function sendableCorrectionTargets(
  targets: TemplateCorrectionTarget[]
): TemplateCorrectionTarget[] {
  return targets.filter((t) => !t.already_corrected && Boolean(t.contact_email?.trim()));
}
