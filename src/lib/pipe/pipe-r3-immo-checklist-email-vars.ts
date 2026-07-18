import { getContactById, getContactsByFoyer } from "@/lib/api/tauri-contacts";
import { getPipeR1DocumentChecklist } from "@/lib/api/tauri-pipe-r1-checklist";
import { getPipeR3ImmoDocumentChecklist } from "@/lib/api/tauri-pipe-r3-immo-checklist";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { formatR3ImmoChecklistEmailList } from "@/lib/pipe/pipe-checklist-email-list";
import { isR3ImmoRdvEntryTitre } from "@/lib/pipe/pipe-rdv-plan-option";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import {
  buildR3ImmoChecklistContext,
  getActiveR3ImmoChecklistItems,
  type R3ImmoChecklistContext,
} from "@/lib/pipe/r3-immo-document-checklist";
import {
  loadR3ImmoChecklistTemplate,
  type R3ImmoChecklistTemplate,
} from "@/lib/pipe/r3-immo-checklist-template";
import { loadInvestissementsForContactIds } from "@/lib/pipe/r3-immo-missing-docs-loader";

export const R3_IMMO_CHECKLIST_EMAIL_VAR_KEY = "liste_documents_r3_immo_html" as const;

export function templateUsesR3ImmoChecklistEmailVariables(
  ...parts: (string | null | undefined)[]
): boolean {
  const hay = parts.filter(Boolean).join("\n");
  return hay.includes(`{{${R3_IMMO_CHECKLIST_EMAIL_VAR_KEY}}}`);
}

/** Liste immo injectée seulement pour RDV R3 Immo (pas R3 Placements). */
export function shouldInjectR3ImmoChecklistEmailVars(options: {
  rdvStage?: PipeRdvStage;
  timelineEntryTitre?: string | null;
}): boolean {
  if (options.rdvStage !== "R3") return false;
  if (!options.timelineEntryTitre?.trim()) return false;
  return isR3ImmoRdvEntryTitre(options.timelineEntryTitre);
}

export async function buildR3ImmoChecklistEmailVariables(
  pipe: Pick<PipeRecord, "id" | "contact_id" | "secondary_contact_id">
): Promise<Record<string, string>> {
  if (pipe.id <= 0 || pipe.contact_id <= 0) {
    return { [R3_IMMO_CHECKLIST_EMAIL_VAR_KEY]: "" };
  }

  const [contact, checklist, r1Checklist, investissements, template] = await Promise.all([
    getContactById(pipe.contact_id),
    getPipeR3ImmoDocumentChecklist(pipe.id),
    getPipeR1DocumentChecklist(pipe.id).catch(() => null),
    loadInvestissementsForContactIds(pipe.contact_id, pipe.secondary_contact_id),
    loadR3ImmoChecklistTemplate(),
  ]);

  const foyerMembers =
    contact.foyer_id != null && contact.foyer_id > 0
      ? await getContactsByFoyer(contact.foyer_id)
      : [];

  const ctx = buildR3ImmoChecklistContext({
    contact,
    secondaryContactId: pipe.secondary_contact_id,
    foyerMembers,
    investissements,
    checklist,
    r1Checklist,
  });

  return buildR3ImmoChecklistEmailVariablesFromContext(template, ctx);
}

export function buildR3ImmoChecklistEmailVariablesFromContext(
  template: R3ImmoChecklistTemplate,
  ctx: R3ImmoChecklistContext
): Record<string, string> {
  const items = getActiveR3ImmoChecklistItems(ctx, template);
  const { html } = formatR3ImmoChecklistEmailList(items, template);

  return {
    [R3_IMMO_CHECKLIST_EMAIL_VAR_KEY]: html,
  };
}

/** Aperçu Paramètres : toutes les pièces configurées (sans filtre dossier). */
export function buildR3ImmoChecklistEmailVariablesFromTemplate(
  template: R3ImmoChecklistTemplate
): Record<string, string> {
  const { html } = formatR3ImmoChecklistEmailList(template.items, template);

  return {
    [R3_IMMO_CHECKLIST_EMAIL_VAR_KEY]: html,
  };
}
