import type { Document } from "@/lib/api/tauri-documents";

export function isIdentityDocument(type: string): boolean {
  return type === "IDENTITE";
}

export function formatUnixDateFr(timestamp: number): string {
  return new Date(timestamp * 1000).toLocaleDateString("fr-FR");
}

export function formatIsoDateFr(isoDate: string): string | null {
  const ms = Date.parse(isoDate);
  if (Number.isNaN(ms)) return null;
  return new Date(ms).toLocaleDateString("fr-FR");
}

export type DocumentMetaLine = { label: string; value: string };

/** Libellés d'affichage : validité (IDENTITE) vs date du document + ajout. */
export function getDocumentMetaLines(doc: Document): DocumentMetaLine[] {
  const lines: DocumentMetaLine[] = [];

  if (isIdentityDocument(doc.type_document)) {
    if (doc.date_document) {
      const fr = formatIsoDateFr(doc.date_document);
      if (fr) lines.push({ label: "Validité", value: fr });
    }
    return lines;
  }

  if (doc.date_document) {
    const fr = formatIsoDateFr(doc.date_document);
    if (fr) lines.push({ label: "Date du document", value: fr });
  }
  lines.push({ label: "Ajouté le", value: formatUnixDateFr(doc.created_at) });
  return lines;
}

/** Date de tri timeline : import pour IDENTITE, sinon `date_document` ou import. */
export function documentTimelineSortDate(doc: Document): number {
  if (isIdentityDocument(doc.type_document)) {
    return doc.created_at;
  }
  if (doc.date_document) {
    const ms = Date.parse(doc.date_document);
    if (!Number.isNaN(ms)) return Math.floor(ms / 1000);
  }
  return doc.created_at;
}
