import { useCallback, useEffect, useState } from "react";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { mapR3ImmoChecklistKeysToLabels } from "@/lib/pipe/r3-immo-document-checklist";
import { reloadR3ImmoMissingDocsForPipes } from "@/lib/pipe/r3-immo-missing-docs-loader";
import {
  subscribeR3ImmoChecklistTemplatesChanged,
  type R3ImmoChecklistTemplate,
} from "@/lib/pipe/r3-immo-checklist-template";
import { subscribePipeR1ChecklistChanged } from "@/lib/pipe/pipe-r1-checklist-events";
import { subscribePipeR3ImmoChecklistChanged } from "@/lib/pipe/pipe-r3-immo-checklist-events";
import { subscribePipeChanged } from "@/lib/pipe/pipe-events";

export function usePipeListR3ImmoMissingDocs(
  enabled: boolean,
  pipes: readonly PipeRecord[],
  template: R3ImmoChecklistTemplate | null
) {
  const [missingByPipeId, setMissingByPipeId] = useState<Record<number, string[]>>({});

  const reload = useCallback(async () => {
    if (!enabled || !template) {
      setMissingByPipeId({});
      return;
    }
    try {
      setMissingByPipeId(await reloadR3ImmoMissingDocsForPipes(pipes));
    } catch {
      setMissingByPipeId({});
    }
  }, [enabled, pipes, template]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!enabled || !template) return;

    const onChecklistChanged = (detail?: { pipeId: number; missingItemKeys: string[] }) => {
      if (!detail?.pipeId) {
        void reload();
        return;
      }
      setMissingByPipeId((prev) => {
        const next = { ...prev };
        const labels = mapR3ImmoChecklistKeysToLabels(detail.missingItemKeys, template);
        if (labels.length === 0) {
          delete next[detail.pipeId];
        } else {
          next[detail.pipeId] = labels;
        }
        return next;
      });
    };

    const onRefresh = () => {
      void reload();
    };

    const unsubChecklist = subscribePipeR3ImmoChecklistChanged(onChecklistChanged);
    const unsubR1Checklist = subscribePipeR1ChecklistChanged(onRefresh);
    const unsubPipe = subscribePipeChanged(onRefresh);
    const unsubContacts = subscribeContactsChanged(onRefresh);
    const unsubInvestissements = subscribeInvestissementsChanged(onRefresh);
    const unsubTemplates = subscribeR3ImmoChecklistTemplatesChanged(onRefresh);
    return () => {
      unsubChecklist();
      unsubR1Checklist();
      unsubPipe();
      unsubContacts();
      unsubInvestissements();
      unsubTemplates();
    };
  }, [enabled, reload, template]);

  return missingByPipeId;
}
