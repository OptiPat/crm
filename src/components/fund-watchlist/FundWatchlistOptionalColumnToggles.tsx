import { ChevronDown, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  FUND_WATCHLIST_OPTIONAL_GROUPS,
  type FundWatchlistOptionalColumnGroup,
} from "@/lib/fund-watchlist/fund-watchlist-table-layout";

type Props = {
  expanded: Record<FundWatchlistOptionalColumnGroup, boolean>;
  onToggle: (group: FundWatchlistOptionalColumnGroup) => void;
};

export function FundWatchlistOptionalColumnToggles({ expanded, onToggle }: Props) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-muted-foreground">Colonnes optionnelles :</span>
      {(Object.keys(FUND_WATCHLIST_OPTIONAL_GROUPS) as FundWatchlistOptionalColumnGroup[]).map(
        (group) => {
          const isOpen = expanded[group];
          return (
            <Button
              key={group}
              type="button"
              size="sm"
              variant={isOpen ? "secondary" : "outline"}
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => onToggle(group)}
              aria-expanded={isOpen}
            >
              {isOpen ? (
                <ChevronDown className="h-3.5 w-3.5 shrink-0" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 shrink-0" />
              )}
              {FUND_WATCHLIST_OPTIONAL_GROUPS[group].label}
            </Button>
          );
        }
      )}
    </div>
  );
}
