import type { CgpConfig } from "@/lib/api/tauri-settings";
import {
  buildVariablesFromContact,
  SAMPLE_PREVIEW_CONTACT,
} from "@/lib/emails/template-email-meta";

/** Variables disponibles dans objet, corps texte et HTML newsletter. */
export function buildNewsletterTemplateVariables(
  cgp: CgpConfig | null,
  contact?: { prenom?: string | null; nom?: string | null; email?: string | null }
): Record<string, string> {
  const vars = buildVariablesFromContact(
    {
      prenom: contact?.prenom?.trim() || SAMPLE_PREVIEW_CONTACT.prenom,
      nom: contact?.nom?.trim() || SAMPLE_PREVIEW_CONTACT.nom,
      email: contact?.email?.trim() || SAMPLE_PREVIEW_CONTACT.email,
    },
    cgp,
    null
  );
  return {
    ...vars,
    cabinet: vars.cabinet?.trim() || "Cabinet",
  };
}

export const NEWSLETTER_VARIABLE_HINTS = [
  "{{prenom}}",
  "{{nom}}",
  "{{cabinet}}",
  "{{lien_agenda}}",
] as const;
