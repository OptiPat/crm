import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { type Document } from "@/lib/api/tauri-documents";
import {
  loadPipeChecklistDocumentsForContacts,
  mergePipeChecklistDocument,
} from "@/lib/pipe/pipe-checklist-documents";
import {
  getPipeR1DocumentChecklist,
  mergePipeR1ChecklistUpdate,
  updatePipeR1DocumentChecklist,
  type PipeR1DocumentChecklist,
  type UpdatePipeR1DocumentChecklistInput,
} from "@/lib/api/tauri-pipe-r1-checklist";
import { getChecklistItemState, listMissingR1ChecklistKeys } from "@/lib/pipe/r1-document-checklist";
import type { PipeChecklistTemplates } from "@/lib/pipe/pipe-checklist-template";
import { linkChecklistItemDocument } from "@/lib/pipe/pipe-checklist-link-document";
import { usePipeChecklistHookSession } from "@/lib/pipe/pipe-checklist-hook-session";
import { notifyPipeR1ChecklistChanged } from "@/lib/pipe/pipe-r1-checklist-events";
import { subscribeDocumentsChanged } from "@/lib/documents/document-events";

export function usePipeR1DocumentChecklist(
  pipeId: number,
  contactId: number,
  secondaryContactId: number | null | undefined,
  enabled: boolean,
  templates: PipeChecklistTemplates | null
) {
  const [checklist, setChecklist] = useState<PipeR1DocumentChecklist | null>(null);
  const checklistRef = useRef<PipeR1DocumentChecklist | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(false);
  const { activePipeIdRef, sessionGenerationRef, persistGenerationRef, linkGenerationRef } =
    usePipeChecklistHookSession(pipeId, contactId, secondaryContactId);

  useEffect(() => {
    checklistRef.current = checklist;
  }, [checklist]);

  const load = useCallback(async () => {
    if (!enabled || pipeId <= 0 || contactId <= 0) {
      setChecklist(null);
      checklistRef.current = null;
      setDocuments([]);
      setLoading(false);
      return;
    }

    const generation = sessionGenerationRef.current;
    setLoading(true);
    try {
      const [loadedChecklist, loadedDocs] = await Promise.all([
        getPipeR1DocumentChecklist(pipeId),
        loadPipeChecklistDocumentsForContacts(contactId, secondaryContactId),
      ]);
      if (generation !== sessionGenerationRef.current) return;
      setChecklist(loadedChecklist);
      checklistRef.current = loadedChecklist;
      setDocuments(loadedDocs);
    } catch (err) {
      if (generation !== sessionGenerationRef.current) return;
      toast.error(String(err));
      setChecklist(null);
      checklistRef.current = null;
    } finally {
      if (generation === sessionGenerationRef.current) {
        setLoading(false);
      }
    }
  }, [contactId, enabled, pipeId, secondaryContactId, sessionGenerationRef]);

  useEffect(() => {
    void load();
  }, [load]);

  const reloadDocuments = useCallback(async () => {
    if (!enabled || contactId <= 0) return;
    const generation = sessionGenerationRef.current;
    try {
      const loadedDocs = await loadPipeChecklistDocumentsForContacts(
        contactId,
        secondaryContactId
      );
      if (generation !== sessionGenerationRef.current) return;
      setDocuments(loadedDocs);
    } catch {
      // Rafraîchissement silencieux (évite les toasts en triple si plusieurs checklists actives).
    }
  }, [contactId, enabled, secondaryContactId, sessionGenerationRef]);

  useEffect(() => {
    if (!enabled || contactId <= 0) return;
    return subscribeDocumentsChanged(() => {
      void reloadDocuments();
    });
  }, [contactId, enabled, reloadDocuments]);

  const persist = useCallback(
    async (update: UpdatePipeR1DocumentChecklistInput): Promise<boolean> => {
      if (!enabled || pipeId <= 0) return false;

      let snapshot: PipeR1DocumentChecklist | null = null;
      setChecklist((prev) => {
        if (!prev) return prev;
        snapshot = prev;
        const merged = mergePipeR1ChecklistUpdate(prev, update);
        checklistRef.current = merged;
        return merged;
      });
      if (!snapshot) return false;

      const generation = ++persistGenerationRef.current;
      const requestPipeId = pipeId;
      try {
        const updated = await updatePipeR1DocumentChecklist(pipeId, update);
        if (
          generation !== persistGenerationRef.current ||
          activePipeIdRef.current !== requestPipeId
        ) {
          return false;
        }
        setChecklist(updated);
        checklistRef.current = updated;
        notifyPipeR1ChecklistChanged({
          pipeId,
          missingItemKeys: templates
            ? listMissingR1ChecklistKeys(updated, templates)
            : [],
        });
        return true;
      } catch (err) {
        toast.error(String(err));
        if (
          generation !== persistGenerationRef.current ||
          activePipeIdRef.current !== requestPipeId
        ) {
          return false;
        }
        setChecklist(snapshot);
        checklistRef.current = snapshot;
        if (enabled && pipeId > 0 && contactId > 0) {
          await load();
        }
        return false;
      }
    },
    [activePipeIdRef, contactId, enabled, load, persistGenerationRef, pipeId, templates]
  );

  const addDocument = useCallback((doc: Document) => {
    setDocuments((prev) => mergePipeChecklistDocument(prev, doc));
  }, []);

  const linkItemDocument = useCallback(
    async (itemId: string, documentId: number | null) => {
      await linkChecklistItemDocument({
        enabled,
        pipeId,
        itemId,
        documentId,
        checklistRef,
        activePipeIdRef,
        setChecklist,
        getItemState: getChecklistItemState,
        mergeUpdate: mergePipeR1ChecklistUpdate,
        linkGenerationRef,
        saveUpdate: (update) => updatePipeR1DocumentChecklist(pipeId, update),
        onSaved: (updated) => {
          notifyPipeR1ChecklistChanged({
            pipeId,
            missingItemKeys: templates ? listMissingR1ChecklistKeys(updated, templates) : [],
          });
        },
      });
    },
    [activePipeIdRef, enabled, linkGenerationRef, pipeId, templates]
  );

  return {
    checklist: checklist?.pipe_id === pipeId ? checklist : null,
    documents,
    loading,
    persist,
    reload: load,
    reloadDocuments,
    addDocument,
    linkItemDocument,
  };
}

