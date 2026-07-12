import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { getAllTemplatesEmail, getTemplateEmailById, updateTemplateEmail } from "@/lib/api/tauri-templates-email";
import { getCgpConfig } from "@/lib/api/tauri-settings";
import {
  PIPE_RDV_STAGE_OPTIONS,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";

export const PIPE_RDV_TRIGGER_KEY = "pipe_rdv_trigger";
export const PIPE_RDV_REMINDER_KEY = "pipe_rdv_reminder";

export interface TemplateEmailPipeRdvTriggerConfig {
  /** Envoi immédiat à la planification / replanification d'un RDV Pipe. */
  enabled: boolean;
  stages: PipeRdvStage[];
}

export interface TemplateEmailPipeRdvReminderConfig {
  /** Rappel automatique avant le RDV (ex. 24 h). */
  enabled: boolean;
  /** Heures avant le début du RDV. */
  delai_heures: number;
  /** Heure d'envoi ce jour-là (optionnel, ex. 09:00). */
  envoi_heure: string | null;
  /** Même contenu que le message principal. */
  use_same_message: boolean;
  /** Modèle enfant dédié (si use_same_message = false). */
  reminder_template_id: number | null;
  /** Variante tu du rappel. */
  reminder_tutoiement_template_id: number | null;
}

export const DEFAULT_PIPE_RDV_TRIGGER: TemplateEmailPipeRdvTriggerConfig = {
  enabled: false,
  stages: [],
};

export const DEFAULT_PIPE_RDV_REMINDER: TemplateEmailPipeRdvReminderConfig = {
  enabled: false,
  delai_heures: 24,
  envoi_heure: null,
  use_same_message: true,
  reminder_template_id: null,
  reminder_tutoiement_template_id: null,
};

const REMINDER_NOM_PREFIX = "Rappel RDV — ";

export function buildPipeRdvReminderTemplateNom(parentNom: string): string {
  const trimmed = parentNom.trim();
  if (!trimmed) return "Rappel RDV";
  if (trimmed.startsWith(REMINDER_NOM_PREFIX)) return trimmed;
  return `${REMINDER_NOM_PREFIX}${trimmed}`;
}

function parseStages(raw: unknown): PipeRdvStage[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (s): s is PipeRdvStage =>
      typeof s === "string" && (PIPE_RDV_STAGE_OPTIONS as readonly string[]).includes(s)
  );
}

export function parseTemplateEmailPipeRdvTrigger(
  variables: string | null | undefined
): TemplateEmailPipeRdvTriggerConfig {
  const meta = parseTemplateEmailMeta(variables);
  const raw = meta[PIPE_RDV_TRIGGER_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PIPE_RDV_TRIGGER };
  }
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    stages: parseStages(o.stages),
  };
}

export function parseTemplateEmailPipeRdvReminder(
  variables: string | null | undefined
): TemplateEmailPipeRdvReminderConfig {
  const meta = parseTemplateEmailMeta(variables);
  const raw = meta[PIPE_RDV_REMINDER_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PIPE_RDV_REMINDER };
  }
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    delai_heures:
      typeof o.delai_heures === "number" && o.delai_heures > 0
        ? Math.round(o.delai_heures)
        : DEFAULT_PIPE_RDV_REMINDER.delai_heures,
    envoi_heure:
      typeof o.envoi_heure === "string" && o.envoi_heure.trim()
        ? o.envoi_heure.trim()
        : null,
    use_same_message: o.use_same_message !== false,
    reminder_template_id:
      typeof o.reminder_template_id === "number" && o.reminder_template_id > 0
        ? o.reminder_template_id
        : null,
    reminder_tutoiement_template_id:
      typeof o.reminder_tutoiement_template_id === "number" &&
      o.reminder_tutoiement_template_id > 0
        ? o.reminder_tutoiement_template_id
        : null,
  };
}

export function setTemplateEmailPipeRdvTriggerInMeta(
  variables: string | null | undefined,
  trigger: TemplateEmailPipeRdvTriggerConfig
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  if (!trigger.enabled || trigger.stages.length === 0) {
    delete meta[PIPE_RDV_TRIGGER_KEY];
  } else {
    meta[PIPE_RDV_TRIGGER_KEY] = {
      enabled: true,
      stages: trigger.stages,
    };
  }
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}

export function setTemplateEmailPipeRdvReminderInMeta(
  variables: string | null | undefined,
  reminder: TemplateEmailPipeRdvReminderConfig
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  if (!reminder.enabled) {
    delete meta[PIPE_RDV_REMINDER_KEY];
  } else {
    meta[PIPE_RDV_REMINDER_KEY] = {
      enabled: true,
      delai_heures: reminder.delai_heures,
      envoi_heure: reminder.envoi_heure,
      use_same_message: reminder.use_same_message,
      reminder_template_id: reminder.reminder_template_id,
      reminder_tutoiement_template_id: reminder.reminder_tutoiement_template_id,
    };
  }
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}

export function formatPipeRdvReminderScheduleSummary(
  reminder: Pick<TemplateEmailPipeRdvReminderConfig, "delai_heures" | "envoi_heure">
): string {
  const h = reminder.delai_heures;
  const delaiPart =
    h >= 24 && h % 24 === 0
      ? `${h / 24} j avant le RDV`
      : `${h} h avant le RDV`;
  const heure = reminder.envoi_heure?.trim();
  return heure ? `${delaiPart}, vers ${heure}` : delaiPart;
}

/** Calcule l'horodatage d'envoi du rappel ; null si trop tard ou invalide. */
export function computePipeRdvReminderSendAt(
  rdvStartAtUnix: number,
  reminder: Pick<TemplateEmailPipeRdvReminderConfig, "delai_heures" | "envoi_heure">
): number | null {
  const delaiSec = reminder.delai_heures * 3600;
  let sendAt = rdvStartAtUnix - delaiSec;

  const heure = reminder.envoi_heure?.trim();
  if (heure) {
    const parts = heure.split(":");
    const hours = Number(parts[0]);
    const minutes = Number(parts[1] ?? 0);
    if (!Number.isNaN(hours) && hours >= 0 && hours <= 23) {
      const d = new Date(sendAt * 1000);
      d.setHours(hours, Number.isNaN(minutes) ? 0 : minutes, 0, 0);
      sendAt = Math.floor(d.getTime() / 1000);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  if (sendAt <= now || sendAt >= rdvStartAtUnix) {
    return null;
  }
  return sendAt;
}

export function findPipeRdvTemplatesForStage(
  templates: TemplateEmail[],
  rdvStage: PipeRdvStage
): TemplateEmail[] {
  return templates.filter((t) => {
    const trigger = parseTemplateEmailPipeRdvTrigger(t.variables);
    return trigger.enabled && trigger.stages.includes(rdvStage);
  });
}

export async function resolvePipeRdvTemplateForStage(
  rdvStage: PipeRdvStage,
  templates?: TemplateEmail[]
): Promise<TemplateEmail | null> {
  const all = templates ?? (await getAllTemplatesEmail());
  const matches = findPipeRdvTemplatesForStage(all, rdvStage);
  if (matches.length > 0) {
    return [...matches].sort((a, b) => a.id - b.id)[0] ?? null;
  }

  const anyPipeTrigger = all.some(
    (t) => parseTemplateEmailPipeRdvTrigger(t.variables).enabled
  );
  if (anyPipeTrigger) {
    return null;
  }

  const cgp = await getCgpConfig();
  const legacyId = cgp.pipe_rdv_confirmation_template_id;
  if (legacyId != null && legacyId > 0) {
    try {
      return await getTemplateEmailById(legacyId);
    } catch {
      return null;
    }
  }
  return null;
}

export async function findPipeRdvStageOverlapError(
  templateId: number | null,
  stages: PipeRdvStage[]
): Promise<string | null> {
  if (stages.length === 0) return null;
  const all = await getAllTemplatesEmail();
  for (const t of all) {
    if (templateId != null && t.id === templateId) continue;
    const cfg = parseTemplateEmailPipeRdvTrigger(t.variables);
    if (!cfg.enabled) continue;
    const overlap = stages.filter((s) => cfg.stages.includes(s));
    if (overlap.length > 0) {
      return `L'étape ${overlap.join(", ")} est déjà couverte par le modèle « ${t.nom} ».`;
    }
  }
  return null;
}

export function pipeRdvTriggerBadgeLabel(
  variables: string | null | undefined
): string | null {
  const trigger = parseTemplateEmailPipeRdvTrigger(variables);
  if (!trigger.enabled || trigger.stages.length === 0) return null;
  const reminder = parseTemplateEmailPipeRdvReminder(variables);
  const stages = trigger.stages.join(", ");
  if (reminder.enabled) {
    return `Pipe RDV ${stages} + rappel`;
  }
  return `Pipe RDV ${stages}`;
}

/**
 * Migration one-shot : active le déclencheur Pipe RDV (R1+R2+R3) sur l'ancien modèle
 * référencé dans Paramètres si aucun modèle n'a encore de trigger Pipe.
 */
export async function migrateLegacyPipeRdvConfirmationTemplate(): Promise<boolean> {
  const all = await getAllTemplatesEmail();
  const anyPipeTrigger = all.some(
    (t) => parseTemplateEmailPipeRdvTrigger(t.variables).enabled
  );
  if (anyPipeTrigger) return false;

  const cgp = await getCgpConfig();
  const legacyId = cgp.pipe_rdv_confirmation_template_id;
  if (legacyId == null || legacyId <= 0) return false;

  let template: TemplateEmail;
  try {
    template = await getTemplateEmailById(legacyId);
  } catch {
    return false;
  }

  const trigger = parseTemplateEmailPipeRdvTrigger(template.variables);
  if (trigger.enabled && trigger.stages.length > 0) return false;

  const stages: PipeRdvStage[] = ["R1", "R2", "R3"];
  const overlap = await findPipeRdvStageOverlapError(template.id, stages);
  if (overlap) return false;

  const variables = setTemplateEmailPipeRdvTriggerInMeta(template.variables, {
    enabled: true,
    stages,
  });

  await updateTemplateEmail(template.id, {
    nom: template.nom,
    sujet: template.sujet,
    corps: template.corps,
    categorie: template.categorie,
    variables,
    agenda_link_id: template.agenda_link_id,
    relance_template_id: template.relance_template_id,
    tutoiement_template_id: template.tutoiement_template_id,
  });
  return true;
}

/** Objet / corps préremplis quand on active un message de rappel dédié. */
export const DEFAULT_PIPE_RDV_REMINDER_SUJET = "Rappel — RDV le {{date_rdv}} à {{heure_rdv}}";

export const DEFAULT_PIPE_RDV_REMINDER_CORPS_HTML = [
  "<p>Bonjour {{prenom}},</p>",
  "<p>Je vous rappelle notre rendez-vous prévu le <strong>{{date_rdv}}</strong> à <strong>{{heure_rdv}}</strong>.</p>",
].join("");

export const DEFAULT_PIPE_RDV_REMINDER_SUJET_TU = DEFAULT_PIPE_RDV_REMINDER_SUJET;

export const DEFAULT_PIPE_RDV_REMINDER_CORPS_HTML_TU = [
  "<p>Bonjour {{prenom}},</p>",
  "<p>Je te rappelle notre rendez-vous prévu le <strong>{{date_rdv}}</strong> à <strong>{{heure_rdv}}</strong>.</p>",
].join("");

/** Texte d'aide tu/vous commun confirmation et rappel Pipe RDV. */
export const PIPE_RDV_FORMALITY_HINT =
  "Tu / vous selon le registre de la fiche contact. Couple sur l'affaire → vouvoiement pour les deux destinataires.";
