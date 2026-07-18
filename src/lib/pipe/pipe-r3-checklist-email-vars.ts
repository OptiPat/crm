import { formatR3ChecklistEmailList } from "@/lib/pipe/pipe-checklist-email-list";
import {
  loadPipeChecklistTemplates,
  type PipeChecklistTemplates,
} from "@/lib/pipe/pipe-checklist-template";
import { isR3PlacementsRdvEntryTitre } from "@/lib/pipe/pipe-rdv-plan-option";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { getActiveR3ChecklistItems } from "@/lib/pipe/r3-document-checklist";

export const R3_CHECKLIST_EMAIL_VAR_KEY = "liste_documents_r3_html" as const;

export function templateUsesR3ChecklistEmailVariables(
  ...parts: (string | null | undefined)[]
): boolean {
  const hay = parts.filter(Boolean).join("\n");
  return hay.includes(`{{${R3_CHECKLIST_EMAIL_VAR_KEY}}}`);
}

/** Liste placements injectée seulement pour RDV R3 / R3 Placements (pas R3 Immo). */
export function shouldInjectR3PlacementsChecklistEmailVars(options: {
  rdvStage?: PipeRdvStage;
  timelineEntryTitre?: string | null;
}): boolean {
  if (options.rdvStage !== "R3") return false;
  if (!options.timelineEntryTitre?.trim()) return false;
  return isR3PlacementsRdvEntryTitre(options.timelineEntryTitre);
}

export async function buildR3ChecklistEmailVariables(): Promise<Record<string, string>> {
  const templates = await loadPipeChecklistTemplates();
  return buildR3ChecklistEmailVariablesFromTemplates(templates);
}

export function buildR3ChecklistEmailVariablesFromTemplates(
  templates: PipeChecklistTemplates
): Record<string, string> {
  const items = getActiveR3ChecklistItems(templates);
  const { html } = formatR3ChecklistEmailList(items);

  return {
    [R3_CHECKLIST_EMAIL_VAR_KEY]: html,
  };
}
