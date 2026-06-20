import type { Document } from "@/lib/api/tauri-documents";
import { documentTimelineSortDate } from "@/lib/documents/document-display";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import type { Contact } from "@/lib/api/tauri-contacts";

export type DocumentsPortfolioSort =
  | "date_desc"
  | "name_asc"
  | "client_asc"
  | "type_asc"
  | "size_desc";

export type DocumentsPortfolioGroup = "flat" | "client" | "type";

export const DOCUMENTS_PORTFOLIO_SORT_LABELS: Record<DocumentsPortfolioSort, string> = {
  date_desc: "Plus récent",
  name_asc: "Nom du fichier — A → Z",
  client_asc: "Client — A → Z",
  type_asc: "Type — A → Z",
  size_desc: "Taille — décroissante",
};

export const DOCUMENTS_PORTFOLIO_GROUP_LABELS: Record<DocumentsPortfolioGroup, string> = {
  flat: "Liste unique",
  client: "Par client",
  type: "Par type",
};

export function getDocumentClientLabel(
  doc: Document,
  contactsById: Record<number, Contact>
): string {
  if (doc.contact_id == null) return "Sans client lié";
  const client = contactsById[doc.contact_id];
  if (!client) return `Contact #${doc.contact_id}`;
  return `${client.nom} ${client.prenom}`.trim();
}

function compareLocaleAsc(a: string, b: string): number {
  return a.localeCompare(b, "fr", { sensitivity: "base" });
}

export function sortDocumentsPortfolio(
  items: Document[],
  sort: DocumentsPortfolioSort,
  contactsById: Record<number, Contact>
): Document[] {
  const sorted = [...items].sort((a, b) => {
    switch (sort) {
      case "name_asc":
        return compareLocaleAsc(a.nom_fichier, b.nom_fichier);
      case "client_asc":
        return compareLocaleAsc(
          getDocumentClientLabel(a, contactsById),
          getDocumentClientLabel(b, contactsById)
        );
      case "type_asc":
        return compareLocaleAsc(
          getDocumentTypeLabel(a.type_document),
          getDocumentTypeLabel(b.type_document)
        );
      case "size_desc":
        return b.taille_fichier - a.taille_fichier;
      case "date_desc":
      default:
        return documentTimelineSortDate(b) - documentTimelineSortDate(a);
    }
  });
  return sorted;
}

export type DocumentsDisplaySubgroup = {
  key: string;
  label: string;
  items: Document[];
};

export type DocumentsDisplayGroup = {
  key: string;
  label: string;
  items: Document[];
  /** Sous-sections par type (mode « Par client »). */
  subgroups?: DocumentsDisplaySubgroup[];
};

export function groupDocumentsPortfolio(
  items: Document[],
  mode: DocumentsPortfolioGroup,
  contactsById: Record<number, Contact>
): DocumentsDisplayGroup[] {
  if (items.length === 0) return [];

  if (mode === "flat") {
    return [{ key: "all", label: "Tous les documents", items }];
  }

  if (mode === "type") {
    const byType = new Map<string, Document[]>();
    for (const doc of items) {
      const key = doc.type_document || "AUTRE";
      const list = byType.get(key) ?? [];
      list.push(doc);
      byType.set(key, list);
    }
    return [...byType.entries()]
      .sort(([a], [b]) =>
        compareLocaleAsc(getDocumentTypeLabel(a), getDocumentTypeLabel(b))
      )
      .map(([type, groupItems]) => ({
        key: type,
        label: getDocumentTypeLabel(type),
        items: groupItems,
      }));
  }

  const byClient = new Map<string, { label: string; items: Document[] }>();
  for (const doc of items) {
    const clientKey =
      doc.contact_id != null ? `contact:${doc.contact_id}` : "sans-client";
    const label = getDocumentClientLabel(doc, contactsById);
    const entry = byClient.get(clientKey) ?? { label, items: [] };
    entry.items.push(doc);
    byClient.set(clientKey, entry);
  }
  return [...byClient.entries()]
    .sort(([, a], [, b]) => {
      if (a.label === "Sans client lié") return 1;
      if (b.label === "Sans client lié") return -1;
      return compareLocaleAsc(a.label, b.label);
    })
    .map(([clientKey, { label, items: groupItems }]) => {
      const byType = new Map<string, Document[]>();
      for (const doc of groupItems) {
        const typeKey = doc.type_document || "AUTRE";
        const list = byType.get(typeKey) ?? [];
        list.push(doc);
        byType.set(typeKey, list);
      }
      const subgroups = [...byType.entries()]
        .sort(([a], [b]) =>
          compareLocaleAsc(getDocumentTypeLabel(a), getDocumentTypeLabel(b))
        )
        .map(([typeKey, typeItems]) => ({
          key: `${clientKey}::${typeKey}`,
          label: getDocumentTypeLabel(typeKey),
          items: typeItems,
        }));
      return {
        key: clientKey,
        label,
        items: groupItems,
        subgroups: subgroups.length > 1 ? subgroups : undefined,
      };
    });
}

/** Liste plate automatique quand des filtres réduisent la bibliothèque. */
export function resolveDocumentsGroupModeWhenFiltered(
  groupMode: DocumentsPortfolioGroup,
  hasNarrowingFilters: boolean
): DocumentsPortfolioGroup {
  if (hasNarrowingFilters && groupMode !== "flat") {
    return "flat";
  }
  return groupMode;
}
