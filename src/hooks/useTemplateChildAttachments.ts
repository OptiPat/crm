import { useCallback, useRef, useState } from "react";
import {
  findOrphanAttachments,
  findRemovedAttachments,
  mergeAttachmentsIntoVariables,
  parseTemplateEmailAttachments,
  type TemplateEmailAttachmentMeta,
} from "@/lib/emails/template-email-attachments";
import { removeTemplateEmailAttachment } from "@/lib/api/tauri-template-email-attachments";

export function useTemplateChildAttachments() {
  const [attachments, setAttachments] = useState<TemplateEmailAttachmentMeta[]>([]);
  const baselineRef = useRef<TemplateEmailAttachmentMeta[]>([]);

  const hydrate = useCallback((variables: string | null | undefined) => {
    const parsed = parseTemplateEmailAttachments(variables);
    setAttachments(parsed);
    baselineRef.current = parsed;
  }, []);

  const reset = useCallback(() => {
    setAttachments([]);
    baselineRef.current = [];
  }, []);

  const mergeIntoVariables = useCallback(
    (variables: string | null | undefined, templateId: number) =>
      mergeAttachmentsIntoVariables(variables, attachments, templateId),
    [attachments]
  );

  const commitBaseline = useCallback(() => {
    baselineRef.current = attachments.map((att) => ({ ...att }));
  }, [attachments]);

  const discardOrphans = useCallback(
    (templateId: number | null) => {
      if (templateId == null) return;
      const orphans = findOrphanAttachments(attachments, baselineRef.current);
      void Promise.all(
        orphans.map((att) =>
          removeTemplateEmailAttachment(templateId, att.stored_name).catch(() => undefined)
        )
      );
    },
    [attachments]
  );

  const removeDeletedOnSave = useCallback(
    async (templateId: number | null) => {
      if (templateId == null) return;
      const removed = findRemovedAttachments(attachments, baselineRef.current);
      for (const att of removed) {
        await removeTemplateEmailAttachment(templateId, att.stored_name);
      }
    },
    [attachments]
  );

  return {
    attachments,
    setAttachments,
    hydrate,
    reset,
    mergeIntoVariables,
    commitBaseline,
    discardOrphans,
    removeDeletedOnSave,
  };
}
