import type {
  PipeR1ChecklistItemState,
  PipeR1ChecklistItems,
  PipeR1DocumentChecklist,
} from "@/lib/api/tauri-pipe-r1-checklist";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  getActivePipeChecklistTemplateItems,
  PIPE_CHECKLIST_PROFILE_SCOPE_LABELS,
  type PipeChecklistProfileScope,
  type PipeChecklistTemplateItem,
  type PipeChecklistTemplates,
  type R1ChecklistProfile,
} from "@/lib/pipe/pipe-checklist-template";
import { phaseHasRdvActivityForStage } from "@/lib/pipe/pipe-rdv-delete";

const R1_SECTION_ORDER: PipeChecklistProfileScope[] = ["base", "salarie", "chef", "retraite"];

function primaryProfileScope(item: PipeChecklistTemplateItem): PipeChecklistProfileScope {
  const profiles = item.profiles ?? ["base"];
  if (profiles.includes("base") && profiles.length === 1) return "base";
  return profiles.find((p) => p !== "base") ?? "base";
}

export type { R1ChecklistProfile } from "@/lib/pipe/pipe-checklist-template";

export function checklistProfileFromRecord(
  checklist: Pick<
    PipeR1DocumentChecklist,
    "profile_salarie" | "profile_chef_entreprise" | "profile_retraite"
  >
): R1ChecklistProfile {
  return {
    salarie: checklist.profile_salarie,
    chef_entreprise: checklist.profile_chef_entreprise,
    retraite: checklist.profile_retraite,
  };
}

export function normalizeR1ChecklistItems(
  items: PipeR1ChecklistItems | null | undefined
): PipeR1ChecklistItems {
  return items && typeof items === "object" ? items : {};
}

export function getChecklistItemState(
  items: PipeR1ChecklistItems | null | undefined,
  itemId: string
): PipeR1ChecklistItemState {
  const normalized = normalizeR1ChecklistItems(items);
  const item = normalized[itemId];
  if (!item || typeof item !== "object") return { received: false };
  return item;
}

export function isR1ChecklistItemComplete(
  templateItem: Pick<PipeChecklistTemplateItem, "noCreditOption" | "id">,
  item: PipeR1ChecklistItemState
): boolean {
  const supportsNoCredit =
    templateItem.noCreditOption === true || templateItem.id === "amortissement_prets";
  if (supportsNoCredit) {
    return item.received || item.no_credit === true;
  }
  return item.received;
}

export function getActiveR1ChecklistItems(
  templates: PipeChecklistTemplates,
  profile: R1ChecklistProfile
): PipeChecklistTemplateItem[] {
  return getActivePipeChecklistTemplateItems("R1", templates, profile);
}

/** Libellé court pour une pièce conditionnelle au profil (null si toujours). */
export function describeR1ItemVisibility(item: PipeChecklistTemplateItem): string | null {
  const scope = primaryProfileScope(item);
  if (scope === "base") return null;
  return PIPE_CHECKLIST_PROFILE_SCOPE_LABELS[scope];
}

export function groupR1ItemsBySection(
  items: PipeChecklistTemplateItem[]
): { section: string; items: PipeChecklistTemplateItem[] }[] {
  const byScope = new Map<PipeChecklistProfileScope, PipeChecklistTemplateItem[]>();
  for (const item of items) {
    const scope = primaryProfileScope(item);
    const list = byScope.get(scope) ?? [];
    list.push(item);
    byScope.set(scope, list);
  }
  return R1_SECTION_ORDER.filter((scope) => (byScope.get(scope)?.length ?? 0) > 0).map(
    (scope) => ({
      section: PIPE_CHECKLIST_PROFILE_SCOPE_LABELS[scope],
      items: byScope.get(scope)!,
    })
  );
}

export function countR1ItemsProgress(
  checklist: PipeR1DocumentChecklist,
  items: readonly PipeChecklistTemplateItem[]
): { received: number; total: number } {
  const total = items.length;
  const received = items.filter((def) =>
    isR1ChecklistItemComplete(def, getChecklistItemState(checklist.items, def.id))
  ).length;
  return { received, total };
}

export function countR1ChecklistProgress(
  checklist: PipeR1DocumentChecklist,
  templates: PipeChecklistTemplates
): { received: number; total: number } {
  const profile = checklistProfileFromRecord(checklist);
  const definitions = getActiveR1ChecklistItems(templates, profile);
  const total = definitions.length;
  const received = definitions.filter((def) =>
    isR1ChecklistItemComplete(def, getChecklistItemState(checklist.items, def.id))
  ).length;
  return { received, total };
}

export function listMissingR1ChecklistKeys(
  checklist: PipeR1DocumentChecklist,
  templates: PipeChecklistTemplates
): string[] {
  const profile = checklistProfileFromRecord(checklist);
  return getActiveR1ChecklistItems(templates, profile)
    .filter(
      (def) =>
        !isR1ChecklistItemComplete(def, getChecklistItemState(checklist.items, def.id))
    )
    .map((def) => def.id);
}

export function listMissingR1ChecklistLabels(
  checklist: PipeR1DocumentChecklist,
  templates: PipeChecklistTemplates
): string[] {
  const profile = checklistProfileFromRecord(checklist);
  return getActiveR1ChecklistItems(templates, profile)
    .filter(
      (def) =>
        !isR1ChecklistItemComplete(def, getChecklistItemState(checklist.items, def.id))
    )
    .map((def) => def.label);
}

export function isR1ChecklistPastStage(stage: string): boolean {
  return stage === "R2" || stage === "R3" || stage === "GAGNEE" || stage === "PERDUE_OU_EN_ATTENTE";
}

/** Checklist visible dès qu'un RDV R1 est planifié (y compris en prospection). */
export function shouldShowR1DocumentChecklist(
  entries: PipeTimelineEntryRecord[]
): boolean {
  return phaseHasRdvActivityForStage(entries, "R1");
}

export function defaultR1ChecklistItems(): PipeR1ChecklistItems {
  return {};
}
