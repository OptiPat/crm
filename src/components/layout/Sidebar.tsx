import {
  Home,
  Users,
  Users2,
  UserPlus,
  Wallet,
  FileText,
  Mail,
  Bell,
  Tag,
  Settings,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  Share2,
  House,
  Handshake,
  Landmark,
  History,
  LucideIcon,
  Newspaper,
  ListTodo,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { APP_DISPLAY_NAME, APP_LOGO_URL } from "@/lib/app-branding";
import { getAppInfo } from "@/lib/api/tauri-system";
import { useEffect, useState } from "react";

interface SidebarProps {
  currentPage: string;
  onPageChange: (page: string) => void;
}

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  id: string;
  label: string;
  icon: LucideIcon;
  /** Page ouverte en cliquant sur le libellé du groupe */
  landingPage: string;
  landingLabel: string;
  children: NavItem[];
}

const contactsGroup: NavGroup = {
  id: "contacts",
  label: "Contacts",
  icon: Users,
  landingPage: "contacts",
  landingLabel: "Liste des contacts",
  children: [
    { id: "familles", label: "Familles", icon: Users2 },
    { id: "foyers", label: "Foyers", icon: House },
    { id: "prescripteurs", label: "Prescripteurs", icon: Share2 },
    { id: "partenaires", label: "Partenaires", icon: UserPlus },
  ],
};

const relationGroup: NavGroup = {
  id: "relation",
  label: "Relation client",
  icon: Handshake,
  landingPage: "suivi",
  landingLabel: "Suivi & alertes",
  children: [
    { id: "suivi", label: "Suivi & alertes", icon: Bell },
    { id: "taches", label: "Tâches & rappels", icon: ListTodo },
    { id: "newsletter", label: "Newsletter", icon: Newspaper },
    { id: "interactions", label: "Historique des échanges", icon: History },
  ],
};

const patrimoineGroup: NavGroup = {
  id: "patrimoine",
  label: "Patrimoine",
  icon: Landmark,
  landingPage: "investissements",
  landingLabel: "Investissements",
  children: [
    { id: "investissements", label: "Investissements", icon: Wallet },
    { id: "documents", label: "Documents", icon: FileText },
  ],
};

const standaloneItems: NavItem[] = [
  { id: "dashboard", label: "Tableau de bord", icon: Home },
  { id: "etiquettes", label: "Étiquettes", icon: Tag },
  { id: "templates-email", label: "Templates Email", icon: Mail },
  { id: "parametres", label: "Paramètres", icon: Settings },
];

const navGroups = [contactsGroup, relationGroup, patrimoineGroup];

function groupPageIds(group: NavGroup): string[] {
  return [group.landingPage, ...group.children.map((c) => c.id)];
}

function isGroupActive(group: NavGroup, page: string): boolean {
  return groupPageIds(group).includes(page);
}

function useGroupOpen(page: string, groups: NavGroup[]) {
  const [open, setOpen] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    for (const g of groups) {
      initial[g.id] = isGroupActive(g, page);
    }
    return initial;
  });

  useEffect(() => {
    setOpen((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (isGroupActive(g, page)) next[g.id] = true;
      }
      return next;
    });
  }, [page]);

  return [open, setOpen] as const;
}

function formatSidebarVersion(version: string, collapsed: boolean): string {
  if (collapsed) {
    const parts = version.split(".");
    return parts.length >= 2 ? `v${parts[0]}.${parts[1]}` : `v${version}`;
  }
  return `Version ${version}`;
}

export function Sidebar({ currentPage, onPageChange }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [groupsOpen, setGroupsOpen] = useGroupOpen(currentPage, navGroups);

  useEffect(() => {
    void getAppInfo()
      .then((info) => setAppVersion(info.version))
      .catch(() => setAppVersion(null));
  }, []);

  const navButtonClass = (active: boolean, extra?: string) =>
    cn(
      "w-full justify-start",
      collapsed && "justify-center px-2",
      extra,
      active && "bg-secondary"
    );

  const renderNavItem = (item: NavItem, indented = false) => {
    const Icon = item.icon;
    const isActive = currentPage === item.id;
    return (
      <Button
        key={item.id}
        variant={isActive ? "secondary" : "ghost"}
        className={navButtonClass(isActive, indented ? "h-9 text-sm" : undefined)}
        onClick={() => onPageChange(item.id)}
      >
        <Icon className={cn("h-4 w-4 shrink-0", !collapsed && "mr-3")} />
        {!collapsed && <span className="truncate">{item.label}</span>}
      </Button>
    );
  };

  const renderCollapsedGroup = (group: NavGroup) => {
    const active = isGroupActive(group, currentPage);
    const popoverItems: NavItem[] = [
      { id: group.landingPage, label: group.landingLabel, icon: group.icon },
      ...group.children.filter((c) => c.id !== group.landingPage),
    ];
    const uniquePopoverItems = popoverItems.filter(
      (item, index, arr) => arr.findIndex((x) => x.id === item.id) === index
    );

    const GroupIcon = group.icon;
    return (
      <Popover key={group.id}>
        <PopoverTrigger asChild>
          <Button
            variant={active ? "secondary" : "ghost"}
            className={navButtonClass(active)}
            title={group.label}
          >
            <GroupIcon className="h-5 w-5" />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="right" align="start" className="w-56 p-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide px-2 py-1.5">
            {group.label}
          </p>
          <div className="space-y-0.5">
            {uniquePopoverItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPage === item.id;
              return (
                <Button
                  key={item.id}
                  variant={isActive ? "secondary" : "ghost"}
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => onPageChange(item.id)}
                >
                  <Icon className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Button>
              );
            })}
          </div>
        </PopoverContent>
      </Popover>
    );
  };

  const renderExpandedGroup = (group: NavGroup) => {
    const active = isGroupActive(group, currentPage);
    const isOpen = groupsOpen[group.id] ?? false;
    const GroupIcon = group.icon;
    const childItems = group.children;

    return (
      <div key={group.id} className="space-y-0.5">
        <div className="flex items-center gap-0.5">
          <Button
            variant={active ? "secondary" : "ghost"}
            className="flex-1 justify-start min-w-0"
            onClick={() => onPageChange(group.landingPage)}
          >
            <GroupIcon className="h-5 w-5 mr-3 shrink-0" />
            <span className="truncate">{group.label}</span>
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-9 w-9 shrink-0"
            aria-expanded={isOpen}
            aria-label={
              isOpen ? `Replier ${group.label}` : `Déplier ${group.label}`
            }
            onClick={() =>
              setGroupsOpen((prev) => ({ ...prev, [group.id]: !isOpen }))
            }
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 transition-transform",
                isOpen && "rotate-180"
              )}
            />
          </Button>
        </div>
        {isOpen && childItems.length > 0 && (
          <div className="ml-3 pl-3 border-l border-border/80 space-y-0.5">
            {childItems.map((child) => renderNavItem(child, true))}
          </div>
        )}
      </div>
    );
  };

  const dashboard = standaloneItems[0];
  const afterGroups = standaloneItems.slice(1);

  return (
    <aside
      className={cn(
        "bg-card border-r border-border transition-all duration-300 flex flex-col",
        collapsed ? "w-16" : "w-64"
      )}
    >
      <div
        className={cn(
          "p-4 border-b border-border flex gap-2",
          collapsed ? "flex-col items-center" : "items-center justify-between"
        )}
      >
        <div
          className={cn(
            "flex items-center min-w-0",
            collapsed ? "justify-center" : "gap-2.5 flex-1"
          )}
        >
          <img
            src={APP_LOGO_URL}
            alt=""
            width={40}
            height={40}
            className={cn(
              "shrink-0 object-contain",
              collapsed ? "h-9 w-9" : "h-10 w-10"
            )}
          />
          {!collapsed && (
            <h2 className="text-lg font-serif font-bold text-primary truncate">
              {APP_DISPLAY_NAME}
            </h2>
          )}
        </div>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setCollapsed(!collapsed)}
          className="h-8 w-8 shrink-0"
          aria-label={collapsed ? "Déplier le menu" : "Replier le menu"}
        >
          {collapsed ? (
            <ChevronRight className="h-4 w-4" />
          ) : (
            <ChevronLeft className="h-4 w-4" />
          )}
        </Button>
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {renderNavItem(dashboard)}

        {collapsed
          ? navGroups.map(renderCollapsedGroup)
          : navGroups.map(renderExpandedGroup)}

        {afterGroups.map((item) => renderNavItem(item))}
      </nav>

      <div className="p-4 border-t border-border">
        <div
          className={cn(
            "text-xs text-muted-foreground",
            collapsed ? "text-center" : ""
          )}
        >
          {appVersion
            ? formatSidebarVersion(appVersion, collapsed)
            : collapsed
              ? "v…"
              : "Version …"}
        </div>
      </div>
    </aside>
  );
}
