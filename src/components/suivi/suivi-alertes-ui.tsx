import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/dashboard/StatCard";
import { SuiviAlertesFilters } from "@/components/suivi/SuiviAlertesFilters";
import type { AlerteCategoryFilter } from "@/lib/alertes/alerte-category";
import type {
  AlerteSortMode,
  AlerteUrgencyStatFilter,
  AlerteViewMode,
} from "@/lib/alertes/alerte-filters";
import type { SuiviAlertesActiveFilterId } from "@/lib/alertes/suivi-alertes-active-filters";
import { navigateToTaches } from "@/lib/navigation/taches-navigation";
import {
  AlertCircle,
  Calendar,
  ChevronDown,
  Clock,
  LayoutGrid,
  LayoutList,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function SuiviAlertesHelp({
  onNavigate,
}: {
  onNavigate?: (page: string) => void;
}) {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <AlertCircle className="h-4 w-4 text-primary shrink-0" />
        Alertes auto vs tâches manuelles vs emails
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">Alertes (cette page)</strong> : règles CRM
          automatiques — suivi client +1 an, prospect jamais contacté, fin démembrement,
          anniversaire… Traitez-les ici pour mettre à jour les dates contact.
        </p>
        <p>
          <strong className="text-foreground">Tâches manuelles</strong> : to-do libres avec
          échéance —{" "}
          {onNavigate ? (
            <button
              type="button"
              className="text-primary underline font-medium"
              onClick={() => navigateToTaches(onNavigate)}
            >
              Tâches &amp; rappels
            </button>
          ) : (
            "Tâches & rappels"
          )}
          .
        </p>
        <p>
          <strong className="text-foreground">Emails étiquettes</strong> : campagnes par
          étiquette — onglet Envois ou depuis le bouton Email sur une alerte liée.
        </p>
      </div>
    </details>
  );
}

export function SuiviAlertesSummaryBanner({
  totalCount,
  emailCampaignCount,
  treatedThisWeek,
  onOpenEnvois,
}: {
  totalCount: number;
  emailCampaignCount: number;
  treatedThisWeek: number;
  onOpenEnvois: () => void;
}) {
  if (totalCount === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-muted-foreground">
        <span>
          <strong className="text-foreground">{totalCount}</strong> alerte
          {totalCount > 1 ? "s" : ""} en attente
        </span>
        {emailCampaignCount > 0 && (
          <span>
            <strong className="text-foreground">{emailCampaignCount}</strong> avec campagne
            email active
          </span>
        )}
        {treatedThisWeek > 0 && (
          <span>
            <strong className="text-foreground">{treatedThisWeek}</strong> traitée
            {treatedThisWeek > 1 ? "s" : ""} cette semaine
          </span>
        )}
      </div>
      {emailCampaignCount > 0 && (
        <Button type="button" variant="outline" size="sm" onClick={onOpenEnvois}>
          Voir Envois
        </Button>
      )}
    </div>
  );
}

export function SuiviAlertesUrgencyStatCards({
  counts,
  activeFilter,
  onFilterChange,
}: {
  counts: Record<AlerteUrgencyStatFilter, number>;
  activeFilter: AlerteUrgencyStatFilter | null;
  onFilterChange: (filter: AlerteUrgencyStatFilter | null) => void;
}) {
  const cards: {
    id: AlerteUrgencyStatFilter;
    title: string;
    description: string;
    icon: typeof Clock;
    accentColor: string;
    iconColor: string;
    iconBgColor: string;
  }[] = [
    {
      id: "plus30",
      title: "+30 j",
      description: "Prioritaires",
      icon: AlertCircle,
      accentColor: "#DC2626",
      iconColor: "text-red-600",
      iconBgColor: "bg-red-50",
    },
    {
      id: "plus7",
      title: "+7 j",
      description: "À surveiller",
      icon: Clock,
      accentColor: "#D97706",
      iconColor: "text-amber-600",
      iconBgColor: "bg-amber-50",
    },
    {
      id: "recent",
      title: "Cette semaine",
      description: "Récentes",
      icon: Calendar,
      accentColor: "#059669",
      iconColor: "text-emerald-600",
      iconBgColor: "bg-emerald-50",
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {cards.map((card) => (
        <StatCard
          key={card.id}
          title={card.title}
          value={counts[card.id]}
          description={card.description}
          icon={card.icon}
          accentColor={card.accentColor}
          iconColor={card.iconColor}
          iconBgColor={card.iconBgColor}
          highlight={activeFilter === card.id}
          onClick={() =>
            onFilterChange(activeFilter === card.id ? null : card.id)
          }
        />
      ))}
    </div>
  );
}

export function SuiviAlertesToolbar({
  searchQuery,
  onSearchChange,
  sortMode,
  onSortChange,
  viewMode,
  onViewModeChange,
  categoryFilter,
  categoryCounts,
  onCategoryChange,
  activeFilterChips,
  onClearFilter,
  onClearAll,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  sortMode: AlerteSortMode;
  onSortChange: (mode: AlerteSortMode) => void;
  viewMode: AlerteViewMode;
  onViewModeChange: (mode: AlerteViewMode) => void;
  categoryFilter: AlerteCategoryFilter;
  categoryCounts: Record<AlerteCategoryFilter, number>;
  onCategoryChange: (f: AlerteCategoryFilter) => void;
  activeFilterChips: { id: SuiviAlertesActiveFilterId; label: string }[];
  onClearFilter: (id: SuiviAlertesActiveFilterId) => void;
  onClearAll: () => void;
}) {
  return (
    <div className="space-y-4 pb-4 border-b border-border/60">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[12rem]">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            placeholder="Rechercher un contact…"
            className="pl-9"
          />
        </div>
        <Select value={sortMode} onValueChange={(v) => onSortChange(v as AlerteSortMode)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Tri" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="days_desc">Plus anciennes</SelectItem>
            <SelectItem value="days_asc">Plus récentes</SelectItem>
            <SelectItem value="name">Nom</SelectItem>
            <SelectItem value="type">Type d&apos;alerte</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex rounded-lg border overflow-hidden">
          <Button
            type="button"
            variant={viewMode === "detailed" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none gap-1"
            onClick={() => onViewModeChange("detailed")}
            title="Vue détaillée"
          >
            <LayoutList className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant={viewMode === "compact" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none gap-1"
            onClick={() => onViewModeChange("compact")}
            title="Vue compacte"
          >
            <LayoutGrid className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <SuiviAlertesFilters
        value={categoryFilter}
        counts={categoryCounts}
        onChange={onCategoryChange}
      />

      {activeFilterChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {activeFilterChips.map((chip) => (
            <Badge
              key={chip.id}
              variant="secondary"
              className="gap-1 pl-2 pr-1 py-1 cursor-pointer hover:bg-muted"
              onClick={() => onClearFilter(chip.id)}
            >
              {chip.label}
              <X className="h-3 w-3" />
            </Badge>
          ))}
          <button
            type="button"
            className="text-xs text-muted-foreground underline"
            onClick={onClearAll}
          >
            Tout effacer
          </button>
        </div>
      )}
    </div>
  );
}

export function SuiviAlertesBulkBar({
  selectedCount,
  onBulkReporter,
  onBulkDelete,
  onClearSelection,
  busy,
}: {
  selectedCount: number;
  onBulkReporter: (mois: number) => void;
  onBulkDelete: () => void;
  onClearSelection: () => void;
  busy: boolean;
}) {
  if (selectedCount === 0) return null;

  return (
    <div
      className={cn(
        "flex flex-wrap items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-4 py-3",
        busy && "opacity-70 pointer-events-none"
      )}
    >
      <span className="text-sm font-medium">
        {selectedCount} sélectionnée{selectedCount > 1 ? "s" : ""}
      </span>
      <Button type="button" size="sm" variant="outline" onClick={() => onBulkReporter(3)}>
        Reporter 3 mois
      </Button>
      <Button type="button" size="sm" variant="outline" onClick={() => onBulkReporter(6)}>
        Reporter 6 mois
      </Button>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="text-red-600"
        onClick={onBulkDelete}
      >
        Supprimer
      </Button>
      <Button type="button" size="sm" variant="ghost" className="ml-auto" onClick={onClearSelection}>
        Annuler
      </Button>
    </div>
  );
}

export function SuiviAlertesSectionHeader({ label, count }: { label: string; count: number }) {
  return (
    <h3 className="text-sm font-semibold text-muted-foreground flex items-center gap-2 pt-2">
      {label}
      <Badge variant="outline" className="text-[10px] h-5 tabular-nums">
        {count}
      </Badge>
    </h3>
  );
}

export function SuiviAlertesTraiterDateShortcuts({
  value,
  onChange,
}: {
  value: string;
  onChange: (date: string) => void;
}) {
  const shortcuts = [
    { label: "Aujourd'hui", days: 0 },
    { label: "Hier", days: -1 },
  ] as const;

  const toInput = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  };

  return (
    <div className="flex flex-wrap gap-2">
      {shortcuts.map((s) => {
        const iso = toInput(s.days);
        return (
          <Button
            key={s.label}
            type="button"
            variant={value === iso ? "secondary" : "outline"}
            size="sm"
            onClick={() => onChange(iso)}
          >
            {s.label}
          </Button>
        );
      })}
    </div>
  );
}
