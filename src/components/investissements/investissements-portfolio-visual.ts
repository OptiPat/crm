import type { LucideIcon } from "lucide-react";
import { Building2, Home, Tag, TrendingUp, User, Wallet } from "lucide-react";
import type {
  InvestissementPortfolioGroup,
  PortfolioDisplayGroup,
} from "@/lib/investissements/investissements-portfolio-utils";

const GROUP_VISUAL: Record<
  InvestissementPortfolioGroup,
  { icon: LucideIcon; accentClass: string }
> = {
  category: { icon: Wallet, accentClass: "bg-muted text-foreground" },
  client: { icon: User, accentClass: "bg-blue-50 text-blue-700" },
  partenaire: { icon: Building2, accentClass: "bg-violet-50 text-violet-700" },
  type: { icon: Tag, accentClass: "bg-amber-50 text-amber-800" },
  flat: { icon: TrendingUp, accentClass: "bg-rose-50 text-rose-700" },
};

export function groupVisualForPortfolio(
  group: PortfolioDisplayGroup,
  groupMode: InvestissementPortfolioGroup
): { icon: LucideIcon; accentClass: string } {
  if (groupMode === "category") {
    if (group.key === "immo") {
      return { icon: Home, accentClass: "bg-[#85ad39]/15 text-[#5a7a28]" };
    }
    if (group.key === "fin") {
      return { icon: TrendingUp, accentClass: "bg-rose-50 text-rose-700" };
    }
  }
  return GROUP_VISUAL[groupMode];
}
