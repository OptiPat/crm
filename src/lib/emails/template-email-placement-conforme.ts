import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { getAllTemplatesEmail, getTemplateEmailById } from "@/lib/api/tauri-templates-email";
import type { PlacementOperationType } from "@/lib/api/tauri-box-placement";

export const PLACEMENT_CONFORME_TRIGGER_KEY = "placement_conforme_trigger";

export const PLACEMENT_OPERATION_TYPE_OPTIONS = [
  "ARBITRAGE",
  "VERSEMENT",
  "REINVESTISSEMENT",
  "SOUSCRIPTION",
  "AUTRE",
] as const satisfies readonly PlacementOperationType[];

export type PlacementConformeOperationType = (typeof PLACEMENT_OPERATION_TYPE_OPTIONS)[number];

export interface TemplateEmailPlacementConformeTriggerConfig {
  /** Envoi automatique au client quand l'opération passe en CONFORME. */
  enabled: boolean;
  operation_types: PlacementConformeOperationType[];
}

export const DEFAULT_PLACEMENT_CONFORME_TRIGGER: TemplateEmailPlacementConformeTriggerConfig =
  {
    enabled: false,
    operation_types: [],
  };

function parseOperationTypes(raw: unknown): PlacementConformeOperationType[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is PlacementConformeOperationType =>
      typeof t === "string" &&
      (PLACEMENT_OPERATION_TYPE_OPTIONS as readonly string[]).includes(t)
  );
}

export function parseTemplateEmailPlacementConformeTrigger(
  variables: string | null | undefined
): TemplateEmailPlacementConformeTriggerConfig {
  const meta = parseTemplateEmailMeta(variables);
  const raw = meta[PLACEMENT_CONFORME_TRIGGER_KEY];
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return { ...DEFAULT_PLACEMENT_CONFORME_TRIGGER };
  }
  const o = raw as Record<string, unknown>;
  return {
    enabled: o.enabled === true,
    operation_types: parseOperationTypes(o.operation_types),
  };
}

export function setTemplateEmailPlacementConformeTriggerInMeta(
  variables: string | null | undefined,
  trigger: TemplateEmailPlacementConformeTriggerConfig
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  if (!trigger.enabled || trigger.operation_types.length === 0) {
    delete meta[PLACEMENT_CONFORME_TRIGGER_KEY];
  } else {
    meta[PLACEMENT_CONFORME_TRIGGER_KEY] = {
      enabled: true,
      operation_types: trigger.operation_types,
    };
  }
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}

export function findPlacementConformeTemplatesForOperationType(
  templates: TemplateEmail[],
  operationType: string
): TemplateEmail[] {
  return templates.filter((t) => {
    const trigger = parseTemplateEmailPlacementConformeTrigger(t.variables);
    return (
      trigger.enabled &&
      trigger.operation_types.includes(operationType as PlacementConformeOperationType)
    );
  });
}

export async function resolvePlacementConformeTemplateForOperationType(
  operationType: string,
  templates?: TemplateEmail[]
): Promise<TemplateEmail | null> {
  const all = templates ?? (await getAllTemplatesEmail());
  const matches = findPlacementConformeTemplatesForOperationType(all, operationType);
  if (matches.length > 0) {
    return [...matches].sort((a, b) => a.id - b.id)[0] ?? null;
  }
  return null;
}

export async function findPlacementConformeOperationTypeOverlapError(
  templateId: number | null,
  operationTypes: PlacementConformeOperationType[]
): Promise<string | null> {
  if (operationTypes.length === 0) return null;
  const all = await getAllTemplatesEmail();
  for (const t of all) {
    if (templateId != null && t.id === templateId) continue;
    const cfg = parseTemplateEmailPlacementConformeTrigger(t.variables);
    if (!cfg.enabled) continue;
    const overlap = operationTypes.filter((type) => cfg.operation_types.includes(type));
    if (overlap.length > 0) {
      return `Le type ${overlap.join(", ")} est déjà couvert par le modèle « ${t.nom} ».`;
    }
  }
  return null;
}

export function placementConformeTriggerBadgeLabel(
  variables: string | null | undefined
): string | null {
  const trigger = parseTemplateEmailPlacementConformeTrigger(variables);
  if (!trigger.enabled || trigger.operation_types.length === 0) return null;
  return `Box Placement ${trigger.operation_types.join(", ")}`;
}

/** Charge le modèle principal + variante tutoiement si liée. */
export async function loadPlacementConformeTemplatePair(
  templateId: number
): Promise<{ principal: TemplateEmail; tutoiement: TemplateEmail | null }> {
  const principal = await getTemplateEmailById(templateId);
  let tutoiement: TemplateEmail | null = null;
  if (principal.tutoiement_template_id && principal.tutoiement_template_id > 0) {
    try {
      tutoiement = await getTemplateEmailById(principal.tutoiement_template_id);
    } catch {
      tutoiement = null;
    }
  }
  return { principal, tutoiement };
}
