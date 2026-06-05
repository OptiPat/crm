import {
  Bell,
  History,
  House,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface QuickAction {
  id: string;
  page: string;
  title: string;
  icon: LucideIcon;
  iconBg: string;
  iconColor: string;
}

const ACTIONS: QuickAction[] = [
  {
    id: "contact",
    page: "contacts",
    title: "Contacts",
    icon: Users,
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    id: "suivi",
    page: "suivi",
    title: "Suivi & alertes",
    icon: Bell,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
  },
  {
    id: "foyer",
    page: "foyers",
    title: "Foyers",
    icon: House,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
  },
  {
    id: "interaction",
    page: "interactions",
    title: "Historique des échanges",
    icon: History,
    iconBg: "bg-blue-50",
    iconColor: "text-blue-700",
  },
  {
    id: "partenaire",
    page: "partenaires",
    title: "Partenaires",
    icon: UserPlus,
    iconBg: "bg-violet-50",
    iconColor: "text-violet-700",
  },
];

interface QuickActionsProps {
  onNavigate?: (page: string) => void;
}

export function QuickActions({ onNavigate }: QuickActionsProps) {
  return (
    <nav
      className="flex gap-2 min-w-0"
      aria-label="Raccourcis navigation"
    >
      {ACTIONS.map((action) => {
        const Icon = action.icon;
        return (
          <button
            key={action.id}
            type="button"
            onClick={() => onNavigate?.(action.page)}
            disabled={!onNavigate}
            className={cn(
              "group flex flex-1 flex-col lg:flex-row items-center justify-center gap-1.5 lg:gap-2 rounded-xl border border-border/70 bg-card px-2 py-3 lg:px-3",
              "hover:bg-muted/50 hover:border-primary/25 hover:shadow-sm transition-all",
              "disabled:opacity-60 min-w-0"
            )}
          >
            <span
              className={cn(
                "inline-flex h-8 w-8 items-center justify-center rounded-lg shrink-0",
                action.iconBg
              )}
            >
              <Icon className={cn("h-4 w-4", action.iconColor)} />
            </span>
            <span className="font-medium text-xs lg:text-sm text-foreground group-hover:text-primary transition-colors text-center lg:text-left leading-tight">
              {action.title}
            </span>
          </button>
        );
      })}
    </nav>
  );
}
