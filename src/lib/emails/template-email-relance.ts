import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";
import {
  emailEnvoiJoursSemaineLabel,
  parseEmailEnvoiJoursSemaine,
  type EmailEnvoiJourCode,
} from "@/lib/emails/email-envoi-schedule";

export const TEMPLATE_EMAIL_RELANCE_KEY = "email_relance";

export interface TemplateEmailRelanceConfig {
  /** Proposer dans Suivi → Envois → À relancer. */
  enabled: boolean;
  /** Repli si un ancien modèle n’a pas de délai dans l’onglet Relance (plus réglable en Paramètres). */
  delai_jours: number | null;
  envoi_heure: string | null;
  envoi_jours_semaine: string | null;
}

export const DEFAULT_TEMPLATE_EMAIL_RELANCE: TemplateEmailRelanceConfig = {
  enabled: false,
  delai_jours: 7,
  envoi_heure: "18:30",
  envoi_jours_semaine: null,
};

/** Repli si un ancien modèle n’a pas de délai dans l’onglet Relance (plus réglable en Paramètres). */
export const DEFAULT_EMAIL_RELANCE_FALLBACK_DELAI_JOURS = 5;

const RELANCE_NOM_PREFIX = "Relance — ";

/** Nom du modèle enfant créé depuis l’onglet Relance (évite « Relance — Relance — … »). */
export function buildRelanceTemplateNom(parentNom: string): string {
  const trimmed = parentNom.trim();
  if (!trimmed) return "Relance";
  if (trimmed.startsWith(RELANCE_NOM_PREFIX)) {
    return trimmed;
  }
  return `${RELANCE_NOM_PREFIX}${trimmed}`;
}

export function parseTemplateEmailRelance(
  variables: string | null | undefined
): TemplateEmailRelanceConfig {
  const meta = parseTemplateEmailMeta(variables);
  const raw = meta[TEMPLATE_EMAIL_RELANCE_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_TEMPLATE_EMAIL_RELANCE, enabled: false };
  }
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    delai_jours:
      typeof o.delai_jours === "number" && o.delai_jours >= 0 ? o.delai_jours : null,
    envoi_heure:
      typeof o.envoi_heure === "string" && o.envoi_heure.trim()
        ? o.envoi_heure.trim()
        : null,
    envoi_jours_semaine:
      typeof o.envoi_jours_semaine === "string" && o.envoi_jours_semaine.trim()
        ? o.envoi_jours_semaine
        : null,
  };
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
  meta[TEMPLATE_EMAIL_RELANCE_KEY] = {
    enabled: relance.enabled,
    ...(relance.enabled
      ? {
          delai_jours: relance.delai_jours,
          envoi_heure: relance.envoi_heure,
          envoi_jours_semaine: relance.envoi_jours_semaine,
        }
      : {}),
  };
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}

export function formatTemplateRelanceScheduleSummary(
  relance: Pick<
    TemplateEmailRelanceConfig,
    "delai_jours" | "envoi_heure" | "envoi_jours_semaine"
  >,
  fallbackDelaiJours: number
): string {
  const delai = relance.delai_jours ?? fallbackDelaiJours;
  const heure = relance.envoi_heure?.trim() || null;
  const jourLabel = emailEnvoiJoursSemaineLabel(relance.envoi_jours_semaine);
  const delaiPart = `${delai} j après le 1er envoi`;
  if (heure && jourLabel) {
    return `${delaiPart}, ${jourLabel.toLowerCase()} à ${heure}`;
  }
  if (heure) {
    return `${delaiPart}, à ${heure}`;
  }
  if (jourLabel) {
    return `${delaiPart}, ${jourLabel.toLowerCase()}`;
  }
  return delaiPart;
}

export function relanceJoursFromConfig(
  envoi_jours_semaine: string | null | undefined
): EmailEnvoiJourCode[] | null {
  return parseEmailEnvoiJoursSemaine(envoi_jours_semaine);
}
