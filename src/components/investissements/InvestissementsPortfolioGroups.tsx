import { PatrimoineCategoryBlock } from "@/components/investissements/PatrimoineCategoryBlock";
import { groupVisualForPortfolio } from "@/components/investissements/investissements-portfolio-visual";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  INVESTISSEMENT_PORTFOLIO_GROUP_LABELS,
  type InvestissementPortfolioGroup,
  sumPatrimoineLineAmountCentimes,
} from "@/lib/investissements/investissements-portfolio-utils";
import type { PortfolioDisplayGroup } from "@/lib/investissements/investissements-portfolio-utils";

export function InvestissementsPortfolioGroups({
  groups,
  groupMode,
  renderCard,
}: {
  groups: PortfolioDisplayGroup[];
  groupMode: InvestissementPortfolioGroup;
  renderCard: (inv: InvestissementWithDetails) => React.ReactNode;
}) {
  if (groups.length === 0) return null;

  return (
    <div className="space-y-6">
      {groups.map((group) => {
        const visual = groupVisualForPortfolio(group, groupMode);
        return (
          <PatrimoineCategoryBlock
            key={group.key}
            title={group.label}
            icon={visual.icon}
            accentClass={visual.accentClass}
            totalCentimes={sumPatrimoineLineAmountCentimes(group.items)}
            count={group.items.length}
          >
            {group.items.map((item) => renderCard(item))}
          </PatrimoineCategoryBlock>
        );
      })}
    </div>
  );
}

export function portfolioGroupModeLabel(mode: InvestissementPortfolioGroup): string {
  return INVESTISSEMENT_PORTFOLIO_GROUP_LABELS[mode];
}
