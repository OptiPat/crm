import { useMemo } from "react";
import type { LucideIcon } from "lucide-react";
import { VirtualizedContactList } from "@/components/contacts/VirtualizedContactList";
import { PatrimoineCategoryBlock } from "@/components/investissements/PatrimoineCategoryBlock";
import { InvestissementsPortfolioGroups } from "@/components/investissements/InvestissementsPortfolioGroups";
import { groupVisualForPortfolio } from "@/components/investissements/investissements-portfolio-visual";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  type InvestissementPortfolioGroup,
  type PortfolioDisplayGroup,
  sumPatrimoineLineAmountCentimes,
} from "@/lib/investissements/investissements-portfolio-utils";

export const INVESTISSEMENTS_VIRTUALIZE_THRESHOLD = 50;

const SECTION_HEADER_ESTIMATE_PX = 56;
const CARD_ESTIMATE_PX = 132;
const CARD_GAP_PX = 12;

export type PortfolioVirtualRow =
  | {
      kind: "section";
      key: string;
      label: string;
      icon: LucideIcon;
      accentClass: string;
      totalCentimes: number;
      count: number;
    }
  | { kind: "card"; key: string; inv: InvestissementWithDetails };

export function flattenPortfolioGroupsForVirtualList(
  groups: PortfolioDisplayGroup[],
  groupMode: InvestissementPortfolioGroup,
  getSectionVisual: (
    group: PortfolioDisplayGroup,
    groupMode: InvestissementPortfolioGroup
  ) => { icon: LucideIcon; accentClass: string }
): PortfolioVirtualRow[] {
  const rows: PortfolioVirtualRow[] = [];
  const skipSection = groupMode === "flat" && groups.length === 1;

  for (const group of groups) {
    if (!skipSection) {
      const visual = getSectionVisual(group, groupMode);
      rows.push({
        kind: "section",
        key: `section-${group.key}`,
        label: group.label,
        icon: visual.icon,
        accentClass: visual.accentClass,
        totalCentimes: sumPatrimoineLineAmountCentimes(group.items),
        count: group.items.length,
      });
    }
    for (const inv of group.items) {
      rows.push({ kind: "card", key: `card-${inv.id}`, inv });
    }
  }
  return rows;
}

type VirtualizedInvestissementsPortfolioProps = {
  groups: PortfolioDisplayGroup[];
  groupMode: InvestissementPortfolioGroup;
  itemCount: number;
  getSectionVisual?: (
    group: PortfolioDisplayGroup,
    groupMode: InvestissementPortfolioGroup
  ) => { icon: LucideIcon; accentClass: string };
  renderCard: (inv: InvestissementWithDetails) => React.ReactNode;
};

export function VirtualizedInvestissementsPortfolio({
  groups,
  groupMode,
  itemCount,
  getSectionVisual = groupVisualForPortfolio,
  renderCard,
}: VirtualizedInvestissementsPortfolioProps) {
  const useVirtual = itemCount >= INVESTISSEMENTS_VIRTUALIZE_THRESHOLD;

  const flatRows = useMemo(
    () => flattenPortfolioGroupsForVirtualList(groups, groupMode, getSectionVisual),
    [groups, groupMode, getSectionVisual]
  );

  if (!useVirtual) {
    return (
      <InvestissementsPortfolioGroups
        groups={groups}
        groupMode={groupMode}
        renderCard={renderCard}
      />
    );
  }

  return (
    <VirtualizedContactList
      className="max-h-[min(70vh,720px)] overflow-y-auto pr-1"
      items={flatRows}
      getKey={(row) => row.key}
      getItemHeight={(row) =>
        row.kind === "section" ? SECTION_HEADER_ESTIMATE_PX : CARD_ESTIMATE_PX
      }
      renderItem={(row) => {
        if (row.kind === "section") {
          return (
            <PatrimoineCategoryBlock
              title={row.label}
              icon={row.icon}
              accentClass={row.accentClass}
              totalCentimes={row.totalCentimes}
              count={row.count}
              headerOnly
            />
          );
        }
        return (
          <div style={{ marginBottom: CARD_GAP_PX }}>{renderCard(row.inv)}</div>
        );
      }}
    />
  );
}
