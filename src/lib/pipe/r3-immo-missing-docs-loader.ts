import { getContactById, getContactsByFoyer } from "@/lib/api/tauri-contacts";
import { getInvestissementsByContact, type Investissement } from "@/lib/api/tauri-investissements";
import { getPipeR1DocumentChecklist } from "@/lib/api/tauri-pipe-r1-checklist";
import { getPipeR3ImmoDocumentChecklist } from "@/lib/api/tauri-pipe-r3-immo-checklist";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { listPipeTimelineEntries } from "@/lib/api/tauri-pipe-timeline";
import { isVersementComplementaireAffaire } from "@/lib/pipe/pipe-suivi";
import { loadR3ImmoChecklistTemplate } from "@/lib/pipe/r3-immo-checklist-template";
import {
  buildR3ImmoChecklistContext,
  listMissingR3ImmoChecklistLabels,
  shouldShowR3ImmoDocumentChecklist,
} from "@/lib/pipe/r3-immo-document-checklist";

export async function loadInvestissementsForContactIds(
  contactId: number,
  secondaryContactId?: number | null
): Promise<Investissement[]> {
  const contactIds = [contactId];
  if (
    secondaryContactId != null &&
    secondaryContactId > 0 &&
    secondaryContactId !== contactId
  ) {
    contactIds.push(secondaryContactId);
  }

  const arrays = await Promise.all(contactIds.map((id) => getInvestissementsByContact(id)));
  const byId = new Map<number, Investissement>();
  for (const inv of arrays.flat()) {
    byId.set(inv.id, inv);
  }
  return [...byId.values()];
}

/** Libellés manquants, ou `null` si la checklist R3 Immo ne s'applique pas à cette affaire. */
export async function computeR3ImmoMissingLabelsForPipe(
  pipe: PipeRecord
): Promise<string[] | null> {
  if (pipe.pipe_type !== "AFFAIRE" || pipe.contact_id <= 0) return null;
  if (isVersementComplementaireAffaire(pipe)) return null;

  const entries = await listPipeTimelineEntries(pipe.id);
  if (!shouldShowR3ImmoDocumentChecklist(entries)) return null;

  const contact = await getContactById(pipe.contact_id);
  const foyerMembers =
    contact.foyer_id != null && contact.foyer_id > 0
      ? await getContactsByFoyer(contact.foyer_id)
      : [];

  const [checklist, r1Checklist, investissements, template] = await Promise.all([
    getPipeR3ImmoDocumentChecklist(pipe.id),
    getPipeR1DocumentChecklist(pipe.id),
    loadInvestissementsForContactIds(pipe.contact_id, pipe.secondary_contact_id),
    loadR3ImmoChecklistTemplate(),
  ]);

  const ctx = buildR3ImmoChecklistContext({
    contact,
    secondaryContactId: pipe.secondary_contact_id,
    foyerMembers,
    investissements,
    checklist,
    r1Checklist,
  });

  const labels = listMissingR3ImmoChecklistLabels(checklist, ctx, template);
  return labels.length > 0 ? labels : [];
}

export async function reloadR3ImmoMissingDocsForPipes(
  pipes: readonly PipeRecord[]
): Promise<Record<number, string[]>> {
  const affaires = pipes.filter(
    (pipe) => pipe.pipe_type === "AFFAIRE" && !isVersementComplementaireAffaire(pipe)
  );

  const rows = await Promise.all(
    affaires.map(async (pipe) => {
      const labels = await computeR3ImmoMissingLabelsForPipe(pipe);
      return { pipeId: pipe.id, labels };
    })
  );

  const map: Record<number, string[]> = {};
  for (const row of rows) {
    if (row.labels != null && row.labels.length > 0) {
      map[row.pipeId] = row.labels;
    }
  }
  return map;
}
