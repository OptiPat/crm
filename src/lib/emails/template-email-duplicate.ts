import {
  createTemplateEmail,
  deleteDetachedTemplateChildren,
  updateTemplateEmail,
  type TemplateEmail,
} from "@/lib/api/tauri-templates-email";
import { copyTemplateEmailAttachments } from "@/lib/api/tauri-template-email-attachments";
import {
  parseTemplateEmailAttachments,
  setTemplateEmailAttachmentsInMeta,
} from "@/lib/emails/template-email-attachments";
import { duplicateTemplatePayload } from "@/lib/emails/template-email-meta";
import { buildTutoiementTemplateNom } from "@/lib/emails/template-email-formality";
import { buildRelanceTemplateNom } from "@/lib/emails/template-email-relance";
import { TEMPLATE_EMAIL_TRIGGER_KEY } from "@/lib/emails/template-email-trigger";
import {
  PIPE_RDV_FOLLOW_UP_KEY,
  PIPE_RDV_REMINDER_KEY,
  PIPE_RDV_TRIGGER_KEY,
} from "@/lib/emails/template-email-pipe-rdv";
import { PLACEMENT_CONFORME_TRIGGER_KEY } from "@/lib/emails/template-email-placement-conforme";

/** Envois automatiques retirés d'une copie : le doublon ne met jamais en file seul. */
const AUTOMATIC_SENDING_KEYS = [
  TEMPLATE_EMAIL_TRIGGER_KEY,
  PIPE_RDV_TRIGGER_KEY,
  PIPE_RDV_REMINDER_KEY,
  PIPE_RDV_FOLLOW_UP_KEY,
  PLACEMENT_CONFORME_TRIGGER_KEY,
] as const;

/**
 * Copie : déclencheur, Pipe RDV (et ses rappels / suivis, qui pointeraient vers les modèles de
 * l'original) et Box Placement désactivés. Le reste (relance, suivi de réponse, mise en forme)
 * est conservé.
 */
export function stripAutomaticSendingFromMeta(variables: string | null): string | null {
  if (!variables?.trim()) return variables;
  let meta: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(variables);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return variables;
    meta = { ...(parsed as Record<string, unknown>) };
  } catch {
    return variables;
  }
  for (const key of AUTOMATIC_SENDING_KEYS) delete meta[key];
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}

async function copyOne(
  created: number[],
  source: TemplateEmail,
  nom: string,
  links: { relance_template_id?: number | null; tutoiement_template_id?: number | null },
  /** Méta de la copie (sinon celle de la source, envois automatiques retirés). */
  variables: string | null = stripAutomaticSendingFromMeta(source.variables),
  categorie: string = source.categorie
): Promise<TemplateEmail> {
  const copy = await createTemplateEmail({
    nom,
    sujet: source.sujet,
    corps: source.corps,
    categorie,
    variables: setTemplateEmailAttachmentsInMeta(variables, []),
    agenda_link_id: source.agenda_link_id,
    relance_template_id: links.relance_template_id ?? null,
    tutoiement_template_id: links.tutoiement_template_id ?? null,
  });
  created.push(copy.id);
  if (parseTemplateEmailAttachments(source.variables).length === 0) return copy;
  const copied = await copyTemplateEmailAttachments(source.id, copy.id);
  return updateTemplateEmail(copy.id, {
    ...copy,
    variables: setTemplateEmailAttachmentsInMeta(copy.variables, copied),
  });
}

/**
 * Duplique un modèle avec sa variante tutoiement et sa relance dédiée (et la relance tu),
 * pièces jointes comprises. Les envois automatiques de la copie sont désactivés.
 */
export async function duplicateTemplateEmail(
  source: TemplateEmail,
  allTemplates: TemplateEmail[]
): Promise<TemplateEmail> {
  const payload = duplicateTemplatePayload(source);
  const byId = (id: number | null | undefined) =>
    id != null ? (allTemplates.find((t) => t.id === id) ?? null) : null;

  // Échec en cours de route : les copies déjà créées sont retirées (pas de copie partielle).
  const created: number[] = [];
  try {
    return await duplicateWithChildren(source, payload, byId, created);
  } catch (e) {
    // Aucune copie n'est reliée à autre chose : toutes partent (la copie principale en premier).
    await deleteDetachedTemplateChildren(created).catch(() => undefined);
    throw e;
  }
}

async function duplicateWithChildren(
  source: TemplateEmail,
  payload: ReturnType<typeof duplicateTemplatePayload>,
  byId: (id: number | null | undefined) => TemplateEmail | null,
  created: number[]
): Promise<TemplateEmail> {
  const tu = byId(source.tutoiement_template_id);
  const relance = byId(source.relance_template_id);
  const relanceTu = byId(relance?.tutoiement_template_id);

  const tuCopy = tu ? await copyOne(created, tu, buildTutoiementTemplateNom(payload.nom), {}) : null;
  const relanceNom = buildRelanceTemplateNom(payload.nom);
  const relanceTuCopy = relanceTu
    ? await copyOne(created, relanceTu, buildTutoiementTemplateNom(relanceNom), {})
    : null;
  const relanceCopy = relance
    ? await copyOne(created, relance, relanceNom, { tutoiement_template_id: relanceTuCopy?.id ?? null })
    : null;

  return copyOne(
    created,
    source,
    payload.nom,
    {
      relance_template_id: relanceCopy?.id ?? null,
      tutoiement_template_id: tuCopy?.id ?? null,
    },
    stripAutomaticSendingFromMeta(payload.variables),
    payload.categorie
  );
}
