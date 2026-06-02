import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";

export const TEMPLATE_EMAIL_RELANCE_KEY = "email_relance";

export interface TemplateEmailRelanceConfig {
  /** Proposer dans Suivi → Envois → À relancer. */
  enabled: boolean;
}

export const DEFAULT_TEMPLATE_EMAIL_RELANCE: TemplateEmailRelanceConfig = {
  enabled: false,
};

export function parseTemplateEmailRelance(
  variables: string | null | undefined
): TemplateEmailRelanceConfig {
  const meta = parseTemplateEmailMeta(variables);
  const raw = meta[TEMPLATE_EMAIL_RELANCE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_TEMPLATE_EMAIL_RELANCE };
  }
  const o = raw as Record<string, unknown>;
  return { enabled: o.enabled === true };
}

/** File d’envoi : aligné sur le filtre SQL (clé absente = anciens modèles avec relance liée). */
export function isTemplateEmailRelanceEnabledForQueue(
  variables: string | null | undefined
): boolean {
  const meta = parseTemplateEmailMeta(variables);
  if (!(TEMPLATE_EMAIL_RELANCE_KEY in meta)) {
    return true;
  }
  return parseTemplateEmailRelance(variables).enabled;
}

export function setTemplateEmailRelanceInMeta(
  variables: string | null | undefined,
  relance: TemplateEmailRelanceConfig
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  meta[TEMPLATE_EMAIL_RELANCE_KEY] = { enabled: relance.enabled };
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}
