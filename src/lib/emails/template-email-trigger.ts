import {
  parseTemplateEmailMeta,
  TEMPLATE_CORPS_HTML_KEY,
} from "@/lib/emails/template-email-html";
import {
  parseEmailEnvoiJoursSemaine,
  serializeEmailEnvoiJoursSemaine,
} from "@/lib/emails/email-envoi-schedule";

export const TEMPLATE_EMAIL_TRIGGER_KEY = "email_trigger";

/** Même vocabulaire que les étiquettes auto (`auto_condition_type`). */
export interface TemplateEmailTriggerConfig {
  enabled: boolean;
  condition_type: string | null;
  condition_config: string | null;
  categories: string[];
  delai_jours: number;
  envoi_heure: string;
  /** JSON `["MAR","MER"]` ou legacy ; `null` = jour calendaire. */
  envoi_jours_semaine?: string | null;
  /** Nouvelle souscription : un envoi par investissement si true. */
  a_chaque_souscription: boolean;
  /** Contacts décochés dans l'aperçu — exclus de la file déclencheur. */
  excluded_contact_ids: number[];
  /** @deprecated lecture seule — migré vers condition_* */
  trigger_type?: "NONE" | "EVENEMENT_SOUSCRIPTION";
  /** @deprecated migré dans condition_config.types */
  event_types?: string[];
}

export const DEFAULT_TEMPLATE_EMAIL_TRIGGER: TemplateEmailTriggerConfig = {
  enabled: false,
  condition_type: null,
  condition_config: null,
  categories: ["CLIENT"],
  delai_jours: 0,
  envoi_heure: "09:00",
  envoi_jours_semaine: null,
  a_chaque_souscription: true,
  excluded_contact_ids: [],
};

function migrateLegacyTrigger(
  o: Record<string, unknown>
): TemplateEmailTriggerConfig {
  const enabled = o.enabled === true;
  const categories = Array.isArray(o.categories)
    ? o.categories.filter((c): c is string => typeof c === "string")
    : DEFAULT_TEMPLATE_EMAIL_TRIGGER.categories;

  let conditionType =
    typeof o.condition_type === "string" && o.condition_type.trim()
      ? o.condition_type.trim()
      : null;
  let conditionConfig =
    typeof o.condition_config === "string" ? o.condition_config : null;

  if (!conditionType && o.trigger_type === "EVENEMENT_SOUSCRIPTION" && enabled) {
    conditionType = "EVENEMENT_SOUSCRIPTION";
    const eventTypes = Array.isArray(o.event_types)
      ? o.event_types.filter((t): t is string => typeof t === "string")
      : [];
    conditionConfig = JSON.stringify({
      types: eventTypes,
      a_chaque_souscription: o.a_chaque_souscription !== false,
    });
  }

  let aChaque = o.a_chaque_souscription !== false;
  if (conditionType === "EVENEMENT_SOUSCRIPTION" && conditionConfig) {
    try {
      const parsed = JSON.parse(conditionConfig) as { a_chaque_souscription?: boolean };
      if (typeof parsed.a_chaque_souscription === "boolean") {
        aChaque = parsed.a_chaque_souscription;
      }
    } catch {
      /* garde défaut */
    }
  }

  return {
    enabled,
    condition_type: enabled ? conditionType : null,
    condition_config: enabled ? conditionConfig : null,
    categories: categories.length > 0 ? categories : ["CLIENT"],
    delai_jours:
      typeof o.delai_jours === "number" && o.delai_jours >= 0
        ? Math.min(365, Math.floor(o.delai_jours))
        : 0,
    envoi_heure:
      typeof o.envoi_heure === "string" && o.envoi_heure.trim()
        ? o.envoi_heure.trim()
        : "09:00",
    envoi_jours_semaine: (() => {
      const raw = o.envoi_jours_semaine;
      if (Array.isArray(raw)) {
        return serializeEmailEnvoiJoursSemaine(
          parseEmailEnvoiJoursSemaine(JSON.stringify(raw))
        );
      }
      if (typeof raw === "string") {
        return serializeEmailEnvoiJoursSemaine(parseEmailEnvoiJoursSemaine(raw));
      }
      return null;
    })(),
    a_chaque_souscription: aChaque,
    excluded_contact_ids: Array.isArray(o.excluded_contact_ids)
      ? o.excluded_contact_ids.filter((id): id is number => typeof id === "number")
      : DEFAULT_TEMPLATE_EMAIL_TRIGGER.excluded_contact_ids,
  };
}

export function parseTemplateEmailTrigger(
  variables: string | null | undefined
): TemplateEmailTriggerConfig {
  const meta = parseTemplateEmailMeta(variables);
  const raw = meta[TEMPLATE_EMAIL_TRIGGER_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_TEMPLATE_EMAIL_TRIGGER };
  }
  return migrateLegacyTrigger(raw as Record<string, unknown>);
}

export function setTemplateEmailTriggerInMeta(
  variables: string | null | undefined,
  trigger: TemplateEmailTriggerConfig
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  const next: TemplateEmailTriggerConfig = {
    ...trigger,
    condition_type: trigger.enabled ? trigger.condition_type : null,
    condition_config: trigger.enabled ? trigger.condition_config : null,
  };
  if (!next.enabled) {
    delete meta[TEMPLATE_EMAIL_TRIGGER_KEY];
  } else {
    const stored = { ...next };
    delete stored.trigger_type;
    delete stored.event_types;
    meta[TEMPLATE_EMAIL_TRIGGER_KEY] = stored;
  }
  const keepCorpsHtml = meta[TEMPLATE_CORPS_HTML_KEY];
  const keys = Object.keys(meta);
  if (keys.length === 0) return null;
  if (!keepCorpsHtml && keys.length === 1 && meta[TEMPLATE_EMAIL_TRIGGER_KEY]) {
    return JSON.stringify(meta);
  }
  return JSON.stringify(meta);
}

export function mergeTemplateVariablesField(
  variables: string | null | undefined,
  patch: Record<string, unknown>
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  Object.assign(meta, patch);
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}
