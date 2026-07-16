import { parseTemplateEmailMeta } from "@/lib/emails/template-email-html";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";
import { getAllTemplatesEmail, getTemplateEmailById } from "@/lib/api/tauri-templates-email";
import type { PlacementOperation } from "@/lib/api/tauri-box-placement";
import {
  AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
  formatPlacementTemplateScopedLabel,
  placementOperationTypeFromStelliumLabel,
  placementTemplateScopedTriggersOverlap,
  placementTemplateTriggerDisplayLabel,
  placementTemplateTriggerMatchesOperation,
  SCPI_STELLIUM_SOUSCRIPTION_LABEL,
  SOUSCRIPTION_PLACEMENT_LABEL_GROUP_ID,
  SCPI_STELLIUM_LABEL_GROUP_ID,
  STELLIUM_BOX_PLACEMENT_LABELS,
  STELLIUM_BOX_PLACEMENT_TEMPLATE_LABELS,
  stelliumBoxPlacementTemplateLabelGroups,
} from "@/lib/placement/stellium-box-placement-labels";
import { VERSEMENT_COMPLEMENTAIRE_ACT_LABEL } from "@/lib/pipe/pipe-suivi";

export const PLACEMENT_CONFORME_TRIGGER_KEY = "placement_conforme_trigger";

/** @deprecated Types grossiers — conservés pour modèles enregistrés avant libellés fins. */
export const PLACEMENT_OPERATION_TYPE_OPTIONS = [
  "ARBITRAGE",
  "VERSEMENT",
  "REINVESTISSEMENT",
  "SOUSCRIPTION",
  "AUTRE",
] as const;

export type PlacementConformeOperationType = (typeof PLACEMENT_OPERATION_TYPE_OPTIONS)[number];

export interface TemplateEmailPlacementConformeTriggerConfig {
  /** Envoi automatique au client quand l'opération passe en CONFORME. */
  enabled: boolean;
  /** Libellés Stellium exacts (sélection Suivi / affaire). */
  stellium_labels: string[];
}

export const DEFAULT_PLACEMENT_CONFORME_TRIGGER: TemplateEmailPlacementConformeTriggerConfig =
  {
    enabled: false,
    stellium_labels: [],
  };

function parseStelliumLabels(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const labels: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    labels.push(trimmed);
  }
  return labels;
}

function parseLegacyOperationTypes(raw: unknown): PlacementConformeOperationType[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (t): t is PlacementConformeOperationType =>
      typeof t === "string" &&
      (PLACEMENT_OPERATION_TYPE_OPTIONS as readonly string[]).includes(t)
  );
}

/** Étend les anciens types grossiers vers les libellés Stellium correspondants. */
export function expandLegacyPlacementConformeOperationTypes(
  types: PlacementConformeOperationType[]
): string[] {
  if (types.length === 0) return [];
  const labels = new Set<string>();
  for (const label of STELLIUM_BOX_PLACEMENT_LABELS) {
    if (types.includes(placementOperationTypeFromStelliumLabel(label))) {
      labels.add(label);
    }
  }
  if (types.includes("VERSEMENT")) labels.add(VERSEMENT_COMPLEMENTAIRE_ACT_LABEL);
  if (types.includes("SOUSCRIPTION")) {
    labels.add(
      formatPlacementTemplateScopedLabel(
        SOUSCRIPTION_PLACEMENT_LABEL_GROUP_ID,
        AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL
      )
    );
    labels.add(
      formatPlacementTemplateScopedLabel(
        SCPI_STELLIUM_LABEL_GROUP_ID,
        SCPI_STELLIUM_SOUSCRIPTION_LABEL
      )
    );
  }
  return [...labels];
}

function normalizeTriggerLabels(labels: string[]): string[] {
  const knownPlain = new Set(
    STELLIUM_BOX_PLACEMENT_TEMPLATE_LABELS.map((label) => label.trim().toLowerCase())
  );
  const knownScoped = new Set(
    stelliumBoxPlacementTemplateLabelGroups().flatMap((group) =>
      group.items.map((label) =>
        formatPlacementTemplateScopedLabel(group.id, label).toLowerCase()
      )
    )
  );
  return labels.filter((label) => {
    const trimmed = label.trim();
    const lower = trimmed.toLowerCase();
    if (knownScoped.has(lower)) return true;
    if (knownPlain.has(lower)) return true;
    const sepIdx = trimmed.indexOf("::");
    if (sepIdx > 0 && knownPlain.has(trimmed.slice(sepIdx + 2).trim().toLowerCase())) {
      return true;
    }
    return false;
  });
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
  const stelliumLabels = parseStelliumLabels(o.stellium_labels);
  if (stelliumLabels.length > 0) {
    const normalized = normalizeTriggerLabels(stelliumLabels);
    if (normalized.length > 0) {
      return {
        enabled: o.enabled === true,
        stellium_labels: normalized,
      };
    }
  }
  const legacyTypes = parseLegacyOperationTypes(o.operation_types);
  return {
    enabled: o.enabled === true,
    stellium_labels: expandLegacyPlacementConformeOperationTypes(legacyTypes),
  };
}

export function setTemplateEmailPlacementConformeTriggerInMeta(
  variables: string | null | undefined,
  trigger: TemplateEmailPlacementConformeTriggerConfig
): string | null {
  const meta = parseTemplateEmailMeta(variables);
  const labels = normalizeTriggerLabels(trigger.stellium_labels);
  if (!trigger.enabled || labels.length === 0) {
    delete meta[PLACEMENT_CONFORME_TRIGGER_KEY];
  } else {
    meta[PLACEMENT_CONFORME_TRIGGER_KEY] = {
      enabled: true,
      stellium_labels: labels,
    };
  }
  return Object.keys(meta).length === 0 ? null : JSON.stringify(meta);
}

export function placementOperationMatchesConformeTrigger(
  operation: Pick<PlacementOperation, "operation_type" | "stellium_label" | "product_label">,
  trigger: TemplateEmailPlacementConformeTriggerConfig
): boolean {
  if (!trigger.enabled || trigger.stellium_labels.length === 0) return false;
  if (
    trigger.stellium_labels.some((label) =>
      placementTemplateTriggerMatchesOperation(operation, label)
    )
  ) {
    return true;
  }
  const coarse = operation.operation_type?.trim();
  if (coarse !== "SOUSCRIPTION") return false;
  return trigger.stellium_labels.some((label) => {
    const plainLabel = placementTemplateTriggerDisplayLabel(label);
    return (
      placementOperationTypeFromStelliumLabel(plainLabel) === coarse &&
      placementTemplateTriggerMatchesOperation(
        {
          stellium_label: operation.stellium_label ?? AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
          product_label: operation.product_label,
        },
        label
      )
    );
  });
}

export function findPlacementConformeTemplatesForOperation(
  templates: TemplateEmail[],
  operation: Pick<PlacementOperation, "operation_type" | "stellium_label" | "product_label">
): TemplateEmail[] {
  return templates.filter((t) => {
    const trigger = parseTemplateEmailPlacementConformeTrigger(t.variables);
    return placementOperationMatchesConformeTrigger(operation, trigger);
  });
}

/** @deprecated Préférer findPlacementConformeTemplatesForOperation. */
export function findPlacementConformeTemplatesForOperationType(
  templates: TemplateEmail[],
  operationType: string
): TemplateEmail[] {
  return findPlacementConformeTemplatesForOperation(templates, {
    operation_type: operationType,
    stellium_label: null,
  });
}

export async function resolvePlacementConformeTemplateForOperation(
  operation: Pick<PlacementOperation, "operation_type" | "stellium_label" | "product_label">,
  templates?: TemplateEmail[]
): Promise<TemplateEmail | null> {
  const all = templates ?? (await getAllTemplatesEmail());
  const matches = findPlacementConformeTemplatesForOperation(all, operation);
  if (matches.length > 0) {
    return [...matches].sort((a, b) => a.id - b.id)[0] ?? null;
  }
  return null;
}

/** @deprecated Préférer resolvePlacementConformeTemplateForOperation. */
export async function resolvePlacementConformeTemplateForOperationType(
  operationType: string,
  templates?: TemplateEmail[]
): Promise<TemplateEmail | null> {
  return resolvePlacementConformeTemplateForOperation(
    { operation_type: operationType, stellium_label: null },
    templates
  );
}

export async function findPlacementConformeStelliumLabelOverlapError(
  templateId: number | null,
  stelliumLabels: string[]
): Promise<string | null> {
  if (stelliumLabels.length === 0) return null;
  const all = await getAllTemplatesEmail();
  for (const t of all) {
    if (templateId != null && t.id === templateId) continue;
    const cfg = parseTemplateEmailPlacementConformeTrigger(t.variables);
    if (!cfg.enabled) continue;
    const overlap = stelliumLabels.filter((label) =>
      cfg.stellium_labels.some((existing) =>
        placementTemplateScopedTriggersOverlap(existing, label)
      )
    );
    if (overlap.length > 0) {
      return `L'acte « ${placementTemplateTriggerDisplayLabel(overlap[0]!)} » est déjà couvert par le modèle « ${t.nom} ».`;
    }
  }
  return null;
}

/** @deprecated Préférer findPlacementConformeStelliumLabelOverlapError. */
export async function findPlacementConformeOperationTypeOverlapError(
  templateId: number | null,
  operationTypes: PlacementConformeOperationType[]
): Promise<string | null> {
  return findPlacementConformeStelliumLabelOverlapError(
    templateId,
    expandLegacyPlacementConformeOperationTypes(operationTypes)
  );
}

export function placementConformeTriggerBadgeLabel(
  variables: string | null | undefined
): string | null {
  const trigger = parseTemplateEmailPlacementConformeTrigger(variables);
  if (!trigger.enabled || trigger.stellium_labels.length === 0) return null;
  if (trigger.stellium_labels.length === 1) {
    return `Box Placement — ${placementTemplateTriggerDisplayLabel(trigger.stellium_labels[0]!)}`;
  }
  return `Box Placement — ${trigger.stellium_labels.length} actes`;
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
