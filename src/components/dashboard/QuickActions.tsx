import {
  Building2,
  Bell,
  MessageSquare,
  UserPlus,
  Users,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { DashboardPanel } from "./dashboard-ui";

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
    title: "Suivi",
    icon: Bell,
    iconBg: "bg-red-50",
    iconColor: "text-red-600",
  },
  {
    id: "foyer",
    page: "foyers",
    title: "Foyers",
    icon: Building2,
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
  },
  {
    id: "interaction",
    page: "interactions",
    title: "Interactions",
    icon: MessageSquare,
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
    <DashboardPanel title="Raccourcis" className="h-full">
      <nav
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-2 gap-2"
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
                "group flex items-center gap-3 rounded-xl border border-border/70 bg-background/80 px-3 py-3",
                "hover:bg-muted/50 hover:border-primary/25 hover:shadow-sm transition-all text-left",
                "disabled:opacity-60 min-h-[3.25rem]"
              )}
            >
              <span
                className={cn(
                  "inline-flex h-9 w-9 items-center justify-center rounded-lg shrink-0",
                  action.iconBg
                )}
              >
                <Icon className={cn("h-4 w-4", action.iconColor)} />
              </span>
              <span className="font-medium text-sm text-foreground group-hover:text-primary transition-colors">
                {action.title}
              </span>
            </button>
          );
        })}
      </nav>
    </DashboardPanel>
  );
}
