import {
  getPipeR1DocumentChecklist,
  updatePipeR1DocumentChecklist,
} from "@/lib/api/tauri-pipe-r1-checklist";
import {
  getActiveR1ChecklistItems,
  checklistProfileFromRecord,
  listMissingR1ChecklistKeys,
} from "@/lib/pipe/r1-document-checklist";
import {
  formatR1ChecklistEmailList,
  suggestR1ChecklistProfileFromContact,
} from "@/lib/pipe/pipe-checklist-email-list";
import {
  loadPipeChecklistTemplates,
  type R1ChecklistProfile,
} from "@/lib/pipe/pipe-checklist-template";
import { notifyPipeR1ChecklistChanged } from "@/lib/pipe/pipe-r1-checklist-events";
import type { Contact } from "@/lib/api/tauri-contacts";

export const R1_CHECKLIST_EMAIL_VAR_KEY = "liste_documents_r1_html" as const;

export function templateUsesR1ChecklistEmailVariables(
  ...parts: (string | null | undefined)[]
): boolean {
  const hay = parts.filter(Boolean).join("\n");
  return hay.includes(`{{${R1_CHECKLIST_EMAIL_VAR_KEY}}}`);
}

export async function buildR1ChecklistEmailVariables(
  pipeId: number
): Promise<Record<string, string>> {
  if (pipeId <= 0) {
    return { [R1_CHECKLIST_EMAIL_VAR_KEY]: "" };
  }

  const [templates, checklist] = await Promise.all([
    loadPipeChecklistTemplates(),
    getPipeR1DocumentChecklist(pipeId),
  ]);

  const profile = checklistProfileFromRecord(checklist);
  const items = getActiveR1ChecklistItems(templates, profile);
  const { html } = formatR1ChecklistEmailList(items);

  return {
    [R1_CHECKLIST_EMAIL_VAR_KEY]: html,
  };
}

export async function saveR1ChecklistProfileForPipe(
  pipeId: number,
  profile: R1ChecklistProfile
): Promise<void> {
  if (pipeId <= 0) return;

  const [templates, checklist] = await Promise.all([
    loadPipeChecklistTemplates(),
    updatePipeR1DocumentChecklist(pipeId, {
      profile_salarie: profile.salarie,
      profile_chef_entreprise: profile.chef_entreprise,
      profile_retraite: profile.retraite,
      profile_revenus_configured: true,
    }),
  ]);

  notifyPipeR1ChecklistChanged({
    pipeId,
    missingItemKeys: listMissingR1ChecklistKeys(checklist, templates),
  });
}

/** Pré-remplit le profil si jamais validé (replanif / rappels sans dialog). */
export async function ensureR1ChecklistProfileForPipeEmail(
  pipeId: number,
  primaryContact: Pick<Contact, "profession" | "date_naissance"> | null
): Promise<void> {
  if (pipeId <= 0) return;

  const checklist = await getPipeR1DocumentChecklist(pipeId);
  if (checklist.profile_revenus_configured) return;

  const profile = primaryContact
    ? suggestR1ChecklistProfileFromContact(primaryContact)
    : { salarie: false, chef_entreprise: false, retraite: false };

  await saveR1ChecklistProfileForPipe(pipeId, profile);
}

export async function loadR1ChecklistProfileForPipePlanning(
  pipeId: number,
  contact: Pick<Contact, "profession" | "date_naissance"> | null
): Promise<R1ChecklistProfile> {
  if (pipeId <= 0) {
    return contact
      ? suggestR1ChecklistProfileFromContact(contact)
      : {
          salarie: false,
          chef_entreprise: false,
          retraite: false,
        };
  }

  try {
    const checklist = await getPipeR1DocumentChecklist(pipeId);
    if (checklist.profile_revenus_configured) {
      return checklistProfileFromRecord(checklist);
    }
  } catch {
    /* checklist pas encore créée */
  }

  return contact
    ? suggestR1ChecklistProfileFromContact(contact)
    : { salarie: false, chef_entreprise: false, retraite: false };
}

export function buildR1ChecklistEmailVariablesFromProfile(
  templates: Awaited<ReturnType<typeof loadPipeChecklistTemplates>>,
  profile: R1ChecklistProfile
): Record<string, string> {
  const items = getActiveR1ChecklistItems(templates, profile);
  const { html } = formatR1ChecklistEmailList(items);

  return {
    [R1_CHECKLIST_EMAIL_VAR_KEY]: html,
  };
}
