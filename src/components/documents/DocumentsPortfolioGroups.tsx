import type { ReactNode } from "react";
import type { DocumentsDisplayGroup } from "@/lib/documents/documents-portfolio-utils";

function renderGroupItems(
  items: DocumentsDisplayGroup["items"],
  renderRow: (doc: DocumentsDisplayGroup["items"][number]) => ReactNode
) {
  return <div className="space-y-3">{items.map((doc) => renderRow(doc))}</div>;
}

export function DocumentsPortfolioGroups({
  groups,
  renderRow,
}: {
  groups: DocumentsDisplayGroup[];
  renderRow: (doc: DocumentsDisplayGroup["items"][number]) => ReactNode;
}) {
  if (groups.length === 0) return null;

  if (groups.length === 1 && groups[0]?.key === "all") {
    return renderGroupItems(groups[0].items, renderRow);
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <section key={group.key} className="space-y-3">
          <div className="flex items-baseline justify-between gap-2 border-b border-border/70 pb-2">
            <h3 className="text-sm font-semibold text-foreground">{group.label}</h3>
            <span className="text-xs text-muted-foreground tabular-nums">
              {group.items.length} doc{group.items.length > 1 ? "s" : ""}
            </span>
          </div>
          {group.subgroups && group.subgroups.length > 0 ? (
            <div className="space-y-4 pl-1">
              {group.subgroups.map((sub) => (
                <div key={sub.key} className="space-y-2">
                  <div className="flex items-baseline justify-between gap-2">
                    <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                      {sub.label}
                    </h4>
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {sub.items.length}
                    </span>
                  </div>
                  {renderGroupItems(sub.items, renderRow)}
                </div>
              ))}
            </div>
          ) : (
            renderGroupItems(group.items, renderRow)
          )}
        </section>
      ))}
    </div>
  );
}
