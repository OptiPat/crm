import { useMemo } from "react";
import { VirtualizedContactList } from "@/components/contacts/VirtualizedContactList";
import { DocumentsPortfolioGroups } from "@/components/documents/DocumentsPortfolioGroups";
import type { Document } from "@/lib/api/tauri-documents";
import type { DocumentsDisplayGroup } from "@/lib/documents/documents-portfolio-utils";

export const DOCUMENTS_VIRTUALIZE_THRESHOLD = 80;

const SECTION_HEADER_ESTIMATE_PX = 48;
const SUBSECTION_HEADER_ESTIMATE_PX = 36;
const CARD_ESTIMATE_PX = 120;
const CARD_GAP_PX = 12;

export type DocumentsVirtualRow =
  | { kind: "section"; key: string; label: string; count: number }
  | { kind: "subsection"; key: string; label: string; count: number }
  | { kind: "card"; key: string; doc: Document };

export function flattenDocumentsGroupsForVirtualList(
  groups: DocumentsDisplayGroup[]
): DocumentsVirtualRow[] {
  const rows: DocumentsVirtualRow[] = [];
  const skipSection = groups.length === 1 && groups[0]?.key === "all";

  for (const group of groups) {
    if (!skipSection) {
      rows.push({
        kind: "section",
        key: `section-${group.key}`,
        label: group.label,
        count: group.items.length,
      });
    }

    if (group.subgroups && group.subgroups.length > 0) {
      for (const sub of group.subgroups) {
        rows.push({
          kind: "subsection",
          key: `sub-${sub.key}`,
          label: sub.label,
          count: sub.items.length,
        });
        for (const doc of sub.items) {
          rows.push({ kind: "card", key: `card-${doc.id}`, doc });
        }
      }
    } else {
      for (const doc of group.items) {
        rows.push({ kind: "card", key: `card-${doc.id}`, doc });
      }
    }
  }

  return rows;
}

type VirtualizedDocumentsPortfolioProps = {
  groups: DocumentsDisplayGroup[];
  itemCount: number;
  renderRow: (doc: Document) => React.ReactNode;
};

export function VirtualizedDocumentsPortfolio({
  groups,
  itemCount,
  renderRow,
}: VirtualizedDocumentsPortfolioProps) {
  const useVirtual = itemCount >= DOCUMENTS_VIRTUALIZE_THRESHOLD;

  const flatRows = useMemo(
    () => flattenDocumentsGroupsForVirtualList(groups),
    [groups]
  );

  if (!useVirtual) {
    return <DocumentsPortfolioGroups groups={groups} renderRow={renderRow} />;
  }

  return (
    <VirtualizedContactList
      className="max-h-[min(70vh,720px)] overflow-y-auto pr-1"
      items={flatRows}
      getKey={(row) => row.key}
      getItemHeight={(row) => {
        if (row.kind === "section") return SECTION_HEADER_ESTIMATE_PX;
        if (row.kind === "subsection") return SUBSECTION_HEADER_ESTIMATE_PX;
        return CARD_ESTIMATE_PX;
      }}
      renderItem={(row) => {
        if (row.kind === "section") {
          return (
            <div className="flex items-baseline justify-between gap-2 border-b border-border/70 pb-2 mb-3">
              <h3 className="text-sm font-semibold text-foreground">{row.label}</h3>
              <span className="text-xs text-muted-foreground tabular-nums">
                {row.count} doc{row.count > 1 ? "s" : ""}
              </span>
            </div>
          );
        }
        if (row.kind === "subsection") {
          return (
            <div className="flex items-baseline justify-between gap-2 mb-2 pl-1">
              <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                {row.label}
              </h4>
              <span className="text-[11px] text-muted-foreground tabular-nums">
                {row.count}
              </span>
            </div>
          );
        }
        return <div style={{ marginBottom: CARD_GAP_PX }}>{renderRow(row.doc)}</div>;
      }}
    />
  );
}
