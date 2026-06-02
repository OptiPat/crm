import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";

export const TEMPLATE_EMAIL_SUIVI_REPONSE_KEY = "email_suivi_reponse";

export interface TemplateEmailSuiviReponseConfig {
  /** Si false : pas de bandeau « en attente de réponse », pas d’onglet suivi relance auto. */
  attendre_reponse: boolean;
}

export const DEFAULT_TEMPLATE_EMAIL_SUIVI_REPONSE: TemplateEmailSuiviReponseConfig = {
  attendre_reponse: true,
};

/** Défaut bienvenue / séquence one-way : pas d’attente de réponse. */
export const DEFAULT_SUIVI_REPONSE_BIENVENUE: TemplateEmailSuiviReponseConfig = {
  attendre_reponse: false,
};

export function parseTemplateEmailSuiviReponse(
  variables: string | null | undefined
): TemplateEmailSuiviReponseConfig {
  const meta = parseTemplateEmailMeta(variables);
  const raw = meta[TEMPLATE_EMAIL_SUIVI_REPONSE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_TEMPLATE_EMAIL_SUIVI_REPONSE };
  }
  const o = raw as Record<string, unknown>;
  return { attendre_reponse: o.attendre_reponse !== false };
}

/** Aligné SQL : clé absente = attendre une réponse (comportement historique). */
export function isTemplateAttendreReponseForQueue(
  variables: string | null | undefined
): boolean {
  const meta = parseTemplateEmailMeta(variables);
  if (!(TEMPLATE_EMAIL_SUIVI_REPONSE_KEY in meta)) {
    return true;
  }
  return parseTemplateEmailSuiviReponse(variables).attendre_reponse;
}

export function setTemplateEmailSuiviReponseInMeta(
  variables: string | null | undefined,
  config: TemplateEmailSuiviReponseConfig
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  meta[TEMPLATE_EMAIL_SUIVI_REPONSE_KEY] = {
    attendre_reponse: config.attendre_reponse,
  };
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}
