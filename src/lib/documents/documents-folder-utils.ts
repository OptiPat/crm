import type { Document } from "@/lib/api/tauri-documents";
import type { Contact } from "@/lib/api/tauri-contacts";
import { documentTimelineSortDate } from "@/lib/documents/document-display";
import { getDocumentClientLabel } from "@/lib/documents/documents-portfolio-utils";

export type DocumentFolderKey = `contact:${number}` | "sans-client";

export type ClientDocumentFolder = {
  key: DocumentFolderKey;
  contactId: number | null;
  label: string;
  documentCount: number;
  latestDocumentAt: number;
};

export function getDocumentFolderKey(doc: Document): DocumentFolderKey {
  return doc.contact_id != null ? `contact:${doc.contact_id}` : "sans-client";
}

export function buildClientDocumentFolders(
  documents: Document[],
  contactsById: Record<number, Contact>
): ClientDocumentFolder[] {
  const byFolder = new Map<
    DocumentFolderKey,
    { label: string; contactId: number | null; items: Document[] }
  >();

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

  return [...byFolder.entries()]
    .map(([key, { label, contactId, items }]) => ({
      key,
      contactId,
      label,
      documentCount: items.length,
      latestDocumentAt: Math.max(...items.map((item) => documentTimelineSortDate(item))),
    }))
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
