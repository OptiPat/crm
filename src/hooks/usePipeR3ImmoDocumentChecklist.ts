import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getContactById,
  getContactsByFoyer,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { type Document } from "@/lib/api/tauri-documents";
import {
  loadPipeChecklistDocumentsForContacts,
  mergePipeChecklistDocument,
} from "@/lib/pipe/pipe-checklist-documents";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  getPipeR1DocumentChecklist,
  type PipeR1DocumentChecklist,
} from "@/lib/api/tauri-pipe-r1-checklist";
import {
  getPipeR3ImmoDocumentChecklist,
  mergePipeR3ImmoChecklistUpdate,
  updatePipeR3ImmoDocumentChecklist,
  type PipeR3ImmoDocumentChecklist,
  type UpdatePipeR3ImmoDocumentChecklistInput,
} from "@/lib/api/tauri-pipe-r3-immo-checklist";
import {
  buildR3ImmoChecklistContext,
  getChecklistItemState,
  listMissingR3ImmoChecklistKeys,
} from "@/lib/pipe/r3-immo-document-checklist";
import { loadInvestissementsForContactIds } from "@/lib/pipe/r3-immo-missing-docs-loader";
import { linkChecklistItemDocument } from "@/lib/pipe/pipe-checklist-link-document";
import { usePipeChecklistHookSession } from "@/lib/pipe/pipe-checklist-hook-session";
import { notifyPipeR3ImmoChecklistChanged } from "@/lib/pipe/pipe-r3-immo-checklist-events";
import { subscribePipeR1ChecklistChanged } from "@/lib/pipe/pipe-r1-checklist-events";
import { subscribeDocumentsChanged } from "@/lib/documents/document-events";
import { useR3ImmoChecklistTemplate } from "@/hooks/useR3ImmoChecklistTemplate";

export function usePipeR3ImmoDocumentChecklist(
  pipeId: number,
  contactId: number,
  secondaryContactId: number | null | undefined,
  enabled: boolean
) {
  const { template: checklistTemplate } = useR3ImmoChecklistTemplate();
  const [checklist, setChecklist] = useState<PipeR3ImmoDocumentChecklist | null>(null);
  const checklistRef = useRef<PipeR3ImmoDocumentChecklist | null>(null);
  const [documents, setDocuments] = useState<Document[]>([]);
  const [contact, setContact] = useState<Contact | null>(null);
  const [foyerMembers, setFoyerMembers] = useState<Contact[]>([]);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [r1Checklist, setR1Checklist] = useState<PipeR1DocumentChecklist | null>(null);
  const [loading, setLoading] = useState(false);
  const { activePipeIdRef, sessionGenerationRef, persistGenerationRef, linkGenerationRef } =
    usePipeChecklistHookSession(pipeId, contactId, secondaryContactId);

  useEffect(() => {
    checklistRef.current = checklist;
  }, [checklist]);

  const reloadContext = useCallback(async () => {
    if (!enabled || contactId <= 0) return;

    try {
      const loadedContact = await getContactById(contactId);
      const foyerPromise =
        loadedContact.foyer_id != null && loadedContact.foyer_id > 0
          ? getContactsByFoyer(loadedContact.foyer_id)
          : Promise.resolve<Contact[]>([]);

      const [loadedFoyer, loadedInvestissements] = await Promise.all([
        foyerPromise,
        loadInvestissementsForContactIds(contactId, secondaryContactId),
      ]);

      setContact(loadedContact);
      setFoyerMembers(loadedFoyer);
      setInvestissements(loadedInvestissements);
    } catch (err) {
      toast.error(String(err));
    }
  }, [contactId, enabled, secondaryContactId]);

  const load = useCallback(async () => {
    if (!enabled || pipeId <= 0 || contactId <= 0) {
      setChecklist(null);
      checklistRef.current = null;
      setDocuments([]);
      setContact(null);
      setFoyerMembers([]);
      setInvestissements([]);
      setR1Checklist(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const generation = sessionGenerationRef.current;
    try {
      const loadedContact = await getContactById(contactId);
      const foyerPromise =
        loadedContact.foyer_id != null && loadedContact.foyer_id > 0
          ? getContactsByFoyer(loadedContact.foyer_id)
          : Promise.resolve<Contact[]>([]);

      const [loadedChecklist, loadedDocs, loadedFoyer, loadedInvestissements, loadedR1] =
        await Promise.all([
        getPipeR3ImmoDocumentChecklist(pipeId),
        loadPipeChecklistDocumentsForContacts(contactId, secondaryContactId),
        foyerPromise,
        loadInvestissementsForContactIds(contactId, secondaryContactId),
        getPipeR1DocumentChecklist(pipeId),
      ]);

      if (generation !== sessionGenerationRef.current) return;
      setChecklist(loadedChecklist);
      checklistRef.current = loadedChecklist;
      setDocuments(loadedDocs);
      setContact(loadedContact);
      setFoyerMembers(loadedFoyer);
      setInvestissements(loadedInvestissements);
      setR1Checklist(loadedR1);
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

  useEffect(() => {
    if (!enabled || contactId <= 0) return;

    const contactIds = new Set(
      [contactId, secondaryContactId].filter((id): id is number => id != null && id > 0)
    );

    const unsubContacts = subscribeContactsChanged((detail) => {
      const patchedId = detail.patchedContact?.id;
      if (patchedId != null && contactIds.has(patchedId)) {
        void reloadContext();
        return;
      }
      if (detail.removedContactId != null && contactIds.has(detail.removedContactId)) {
        void reloadContext();
        return;
      }
      if (!detail.patchedContact && detail.removedContactId == null) {
        void reloadContext();
      }
    });

    const unsubInvestissements = subscribeInvestissementsChanged(() => {
      void reloadContext();
    });

    const unsubR1 = subscribePipeR1ChecklistChanged((detail) => {
      if (detail?.pipeId != null && detail.pipeId !== pipeId) return;
      void getPipeR1DocumentChecklist(pipeId)
        .then(setR1Checklist)
        .catch(() => setR1Checklist(null));
    });

    return () => {
      unsubContacts();
      unsubInvestissements();
      unsubR1();
    };
  }, [contactId, enabled, pipeId, reloadContext, secondaryContactId]);

  const checklistContext = useMemo(() => {
    if (!checklist || !contact) return null;
    return buildR3ImmoChecklistContext({
      contact,
      secondaryContactId,
      foyerMembers,
      investissements,
      checklist,
      r1Checklist,
    });
  }, [checklist, contact, foyerMembers, investissements, r1Checklist, secondaryContactId]);

  useEffect(() => {
    if (!enabled || !checklist || !checklistContext || !checklistTemplate) return;
    notifyPipeR3ImmoChecklistChanged({
      pipeId,
      missingItemKeys: listMissingR3ImmoChecklistKeys(
        checklist,
        checklistContext,
        checklistTemplate
      ),
    });
  }, [checklist, checklistContext, checklistTemplate, enabled, pipeId]);

  const persist = useCallback(
    async (update: UpdatePipeR3ImmoDocumentChecklistInput): Promise<boolean> => {
      if (!enabled || pipeId <= 0) return false;

      let snapshot: PipeR3ImmoDocumentChecklist | null = null;
      setChecklist((prev) => {
        if (!prev) return prev;
        snapshot = prev;
        const merged = mergePipeR3ImmoChecklistUpdate(prev, update);
        checklistRef.current = merged;
        return merged;
      });
      if (!snapshot) return false;

      const generation = ++persistGenerationRef.current;
      const requestPipeId = pipeId;
      try {
        const updated = await updatePipeR3ImmoDocumentChecklist(pipeId, update);
        if (
          generation !== persistGenerationRef.current ||
          activePipeIdRef.current !== requestPipeId
        ) {
          return false;
        }
        setChecklist(updated);
        checklistRef.current = updated;
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
    [activePipeIdRef, contactId, enabled, load, persistGenerationRef, pipeId]
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
        mergeUpdate: mergePipeR3ImmoChecklistUpdate,
        linkGenerationRef,
        saveUpdate: (update) => updatePipeR3ImmoDocumentChecklist(pipeId, update),
        onSaved: (updated) => {
          if (!checklistContext || !checklistTemplate) return;
          notifyPipeR3ImmoChecklistChanged({
            pipeId,
            missingItemKeys: listMissingR3ImmoChecklistKeys(
              updated,
              checklistContext,
              checklistTemplate
            ),
          });
        },
      });
    },
    [activePipeIdRef, checklistContext, checklistTemplate, enabled, linkGenerationRef, pipeId]
  );

  return {
    checklist,
    documents,
    checklistContext,
    checklistTemplate,
    loading,
    persist,
    reload: load,
    reloadDocuments,
    addDocument,
    linkItemDocument,
  };
}
