import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { getDocumentsByContact, type Document } from "@/lib/api/tauri-documents";
import {
  getPipeR3DocumentChecklist,
  mergePipeR3ChecklistUpdate,
  updatePipeR3DocumentChecklist,
  type PipeR3DocumentChecklist,
  type UpdatePipeR3DocumentChecklistInput,
} from "@/lib/api/tauri-pipe-r3-checklist";
import { listMissingR3ChecklistKeys } from "@/lib/pipe/r3-document-checklist";
import type { PipeChecklistTemplates } from "@/lib/pipe/pipe-checklist-template";
import { notifyPipeR3ChecklistChanged } from "@/lib/pipe/pipe-r3-checklist-events";

async function loadDocumentsForContacts(
  contactId: number,
  secondaryContactId?: number | null
): Promise<Document[]> {
  const contactIds = [contactId];
  if (
    secondaryContactId != null &&
    secondaryContactId > 0 &&
    secondaryContactId !== contactId
  ) {
    contactIds.push(secondaryContactId);
  }

  const docArrays = await Promise.all(contactIds.map((id) => getDocumentsByContact(id)));
  const byId = new Map<number, Document>();
  for (const doc of docArrays.flat()) {
    byId.set(doc.id, doc);
  }
  return [...byId.values()];
}

export function usePipeR3DocumentChecklist(
  pipeId: number,
  contactId: number,
  secondaryContactId: number | null | undefined,
  enabled: boolean,
  templates: PipeChecklistTemplates | null
) {
  const [checklist, setChecklist] = useState<PipeR3DocumentChecklist | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const persistGenerationRef = useRef(0);

  const load = useCallback(async () => {
    if (!enabled || pipeId <= 0 || contactId <= 0) {
      setChecklist(null);
      setDocuments([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const [loadedChecklist, loadedDocs] = await Promise.all([
        getPipeR3DocumentChecklist(pipeId),
        loadDocumentsForContacts(contactId, secondaryContactId),
      ]);
      setChecklist(loadedChecklist);
      setDocuments(loadedDocs);
    } catch (err) {
      toast.error(String(err));
      setChecklist(null);
    } finally {
      setLoading(false);
    }
  }, [contactId, enabled, pipeId, secondaryContactId]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (update: UpdatePipeR3DocumentChecklistInput) => {
      if (!enabled || pipeId <= 0) return;

      let snapshot: PipeR3DocumentChecklist | null = null;
      setChecklist((prev) => {
        if (!prev) return prev;
        snapshot = prev;
        return mergePipeR3ChecklistUpdate(prev, update);
      });
      if (!snapshot) return;

      const generation = ++persistGenerationRef.current;
      try {
        const updated = await updatePipeR3DocumentChecklist(pipeId, update);
        if (generation !== persistGenerationRef.current) return;
        setChecklist(updated);
        notifyPipeR3ChecklistChanged({
          pipeId,
          missingItemKeys: templates
            ? listMissingR3ChecklistKeys(updated, templates)
            : [],
        });
      } catch (err) {
        toast.error(String(err));
        if (generation !== persistGenerationRef.current) return;
        setChecklist(snapshot);
        if (enabled && pipeId > 0 && contactId > 0) {
          await load();
        }
      }
    },
    [contactId, enabled, load, pipeId, templates]
  );

  return { checklist, documents, loading, persist, reload: load };
}
