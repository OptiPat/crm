import { 
  Home, 
  Users, 
  Users2,
  UserPlus,
  Wallet,
  FileText, 
  MessageSquare, 
  Mail,
  Bell,
  Settings,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useState } from "react";

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

const menuItems = [
  { id: "dashboard", label: "Tableau de bord", icon: Home },
  { id: "contacts", label: "Contacts", icon: Users },
  { id: "familles", label: "Familles", icon: Users2 },
  { id: "suivi", label: "Suivi", icon: Bell },
  { id: "partenaires", label: "Partenaires", icon: UserPlus },
  { id: "investissements", label: "Investissements", icon: Wallet },
  { id: "documents", label: "Documents", icon: FileText },
  { id: "interactions", label: "Interactions", icon: MessageSquare },
  { id: "templates-email", label: "Templates Email", icon: Mail },
  { id: "parametres", label: "Paramètres", icon: Settings },
];

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={cn(
        "bg-card border-r border-border transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-border flex items-center justify-between">
        {!collapsed && (
          <h2 className="text-lg font-serif font-bold text-primary">
            Patrimoine CRM
          </h2>
        )}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8"
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-2 space-y-1">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;

          return (
            <Button
              key={item.id}
              variant={isActive ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start",
                collapsed && "justify-center px-2"
              )}
              onClick={() => onPageChange(item.id)}
            >
              <Icon className={cn("h-5 w-5", !collapsed && "mr-3")} />
              {!collapsed && <span>{item.label}</span>}
            </Button>
          );
        })}
      </nav>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <div className={cn(
          "text-xs text-muted-foreground",
          collapsed ? "text-center" : ""
        )}>
          {collapsed ? "v0.1" : "Version 0.1.0"}
        </div>
      </div>
    </aside>
  );
}
