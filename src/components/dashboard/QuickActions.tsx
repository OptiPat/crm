import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, MessageSquare, UserPlus, Users, Zap } from "lucide-react";
import { LucideIcon } from "lucide-react";

interface QuickAction {
  id: string;
  page: string;
  title: string;
  description: string;
  icon: LucideIcon;
  accent: string;
  iconBg: string;
  iconColor: string;
}

const ACTIONS: QuickAction[] = [
  {
    id: "contact",
    page: "contacts",
    title: "Nouveau contact",
    description: "Client, prospect ou suspect",
    icon: Users,
    accent: "#1E3A5F",
    iconBg: "bg-primary/10",
    iconColor: "text-primary",
  },
  {
    id: "foyer",
    page: "foyers",
    title: "Nouveau foyer",
    description: "Foyer fiscal ou ménage",
    icon: Building2,
    accent: "#059669",
    iconBg: "bg-emerald-50",
    iconColor: "text-emerald-700",
  },
  {
    id: "interaction",
    page: "interactions",
    title: "Interaction",
    description: "Appel, rendez-vous, note",
    icon: MessageSquare,
    accent: "#3B82F6",
    iconBg: "bg-blue-50",
    iconColor: "text-blue-700",
  },
  {
    id: "partenaire",
    page: "partenaires",
    title: "Partenaire",
    description: "Collaborateur ou réseau",
    icon: UserPlus,
    accent: "#8B5CF6",
    iconBg: "bg-violet-50",
    iconColor: "text-violet-700",
  },
];

interface QuickActionsProps {
  onNavigate?: (page: string) => void;
}

export function QuickActions({ onNavigate }: QuickActionsProps) {
  return (
    <Card className="shadow-sm border-border/80 h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="font-serif text-xl flex items-center gap-2">
          <span className="p-1.5 rounded-lg bg-amber-50">
            <Zap className="h-4 w-4 text-amber-600" />
          </span>
          Actions rapides
        </CardTitle>
        <CardDescription>Accès direct aux écrans les plus utilisés</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => onNavigate?.(action.page)}
                disabled={!onNavigate}
                className="group p-4 rounded-lg border border-border/80 bg-card hover:bg-accent/50 hover:border-primary/25 hover:shadow-sm transition-all text-left disabled:opacity-70"
                style={{ borderLeftWidth: 3, borderLeftColor: action.accent }}
              >
                <div className={`inline-flex p-2 rounded-lg mb-2 ${action.iconBg}`}>
                  <Icon className={`h-5 w-5 ${action.iconColor}`} />
                </div>
                <div className="font-medium text-foreground group-hover:text-primary transition-colors">
                  {action.title}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{action.description}</div>
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
