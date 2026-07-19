import type { Document } from "@/lib/api/tauri-documents";
import type { Contact } from "@/lib/api/tauri-contacts";
import { documentTimelineSortDate } from "@/lib/documents/document-display";
import { getDocumentClientLabel } from "@/lib/documents/documents-portfolio-utils";
import {
  computeClientDocumentCompliance,
  type ClientDocumentCompliance,
  type ClientDocumentTypeBadge,
} from "@/lib/documents/client-document-compliance";

export type DocumentFolderKey = `contact:${number}` | "sans-client";

export type ClientDocumentFolder = {
  key: DocumentFolderKey;
  contactId: number | null;
  label: string;
  documentCount: number;
  latestDocumentAt: number;
  typeBadges: ClientDocumentTypeBadge[];
  alerts: ClientDocumentCompliance["alerts"];
};

type FolderAccumulator = {
  label: string;
  contactId: number | null;
  items: Document[];
};

function accumulateFolders(
  documents: Document[],
  contactsById: Record<number, Contact>
): Map<DocumentFolderKey, FolderAccumulator> {
  const byFolder = new Map<DocumentFolderKey, FolderAccumulator>();
  for (const doc of documents) {
    const key = getDocumentFolderKey(doc);
    const entry = byFolder.get(key) ?? {
      label: getDocumentClientLabel(doc, contactsById),
      contactId: doc.contact_id ?? null,
      items: [],
    };
    entry.items.push(doc);
    byFolder.set(key, entry);
  }
  return byFolder;
}

export function getDocumentFolderKey(doc: Document): DocumentFolderKey {
  return doc.contact_id != null ? `contact:${doc.contact_id}` : "sans-client";
}

export function buildClientDocumentFolders(input: {
  visibleDocuments: Document[];
  allDocuments: Document[];
  contactsById: Record<number, Contact>;
}): ClientDocumentFolder[] {
  const allByFolder = accumulateFolders(input.allDocuments, input.contactsById);
  const visibleByFolder = accumulateFolders(input.visibleDocuments, input.contactsById);

  return [...visibleByFolder.entries()]
    .map(([key, { label, contactId, items: visibleItems }]) => {
      const allItems = allByFolder.get(key)?.items ?? visibleItems;
      const compliance = computeClientDocumentCompliance(allItems, {
        checkMissing: contactId != null,
      });
      return {
        key,
        contactId,
        label,
        documentCount: visibleItems.length,
        latestDocumentAt: Math.max(
          ...visibleItems.map((item) => documentTimelineSortDate(item))
        ),
        typeBadges: compliance.typeBadges,
        alerts: compliance.alerts,
      };
    })
    .sort((a, b) => {
      if (a.key === "sans-client") return 1;
      if (b.key === "sans-client") return -1;
      return a.label.localeCompare(b.label, "fr", { sensitivity: "base" });
    });
}

export function documentsInFolder(
  documents: Document[],
  folderKey: DocumentFolderKey
): Document[] {
  return documents.filter((doc) => getDocumentFolderKey(doc) === folderKey);
}

export function getFolderLabel(
  folderKey: DocumentFolderKey,
  contactsById: Record<number, Contact>
): string {
  if (folderKey === "sans-client") return "Sans client lié";
  const contactId = Number(folderKey.replace("contact:", ""));
  const client = contactsById[contactId];
  if (!client) return `Contact #${contactId}`;
  return `${client.nom} ${client.prenom}`.trim();
}

export function parseContactFolderKey(
  folderKey: string | null
): DocumentFolderKey | null {
  if (!folderKey) return null;
  if (folderKey === "sans-client") return "sans-client";
  if (/^contact:\d+$/.test(folderKey)) {
    return folderKey as DocumentFolderKey;
  }
  return null;
}
