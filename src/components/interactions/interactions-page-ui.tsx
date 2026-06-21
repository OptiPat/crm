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
import { ExchangeHistoryListRow } from "@/components/interactions/ExchangeHistoryListRow";
import type { ExchangeHistoryEntry } from "@/lib/api/tauri-interactions";
import { INTERACTION_TYPES } from "@/lib/api/tauri-interactions";
import type {
  ExchangeKindFilter,
  ExchangeStatFilter,
} from "@/lib/interactions/exchange-history-filters";
import type { ExchangeHistoryYearGroup } from "@/lib/interactions/exchange-history-groups";
import { exchangeEntryKey } from "@/lib/interactions/exchange-history-display";
import {
  CalendarClock,
  ChevronDown,
  History,
  Mail,
  MessageSquare,
  Phone,
  Search,
  X,
} from "lucide-react";

export function InteractionsPageHelp() {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <History className="h-4 w-4 text-primary shrink-0" />
        Historique vs fiche contact → Relation
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">Cette page</strong> est le journal des échanges
          enregistrés : appels, RDV, notes saisies à la main, et{" "}
          <strong className="text-foreground">une ligne par email campagne</strong> envoyé. C&apos;est
          ici que vous <strong className="text-foreground">répondez</strong> ou{" "}
          <strong className="text-foreground">importez la réponse Gmail</strong> après un envoi
          groupé.
        </p>
        <p>
          <strong className="text-foreground">Fiche contact → Relation</strong> montre la vue 360°
          (campagnes, CRM, boîte mail synchronisée, investissements, documents, tâches). Le bouton
          « Répondre dans Historique » depuis Relation ouvre cette page filtrée sur le contact.
        </p>
        <p>
          Les envois <strong className="text-foreground">modèle seul</strong> (sans étiquette)
          apparaissent dans Suivi → Envois tant qu&apos;ils ne sont pas envoyés ; après envoi, ils
          rejoignent ce journal comme les autres campagnes.
        </p>
      </div>
    </details>
  );
}

export function InteractionsStatCards({
  counts,
  activeFilter,
  onFilterChange,
}: {
  counts: Record<ExchangeStatFilter, number>;
  activeFilter: ExchangeStatFilter | null;
  onFilterChange: (filter: ExchangeStatFilter | null) => void;
}) {
  const cards: {
    id: ExchangeStatFilter;
    title: string;
    description: string;
    icon: typeof Mail;
    accentColor: string;
    iconColor: string;
    iconBgColor: string;
  }[] = [
    {
      id: "no_reply",
      title: "Sans réponse",
      description: "Campagnes actives visibles ici",
      icon: MessageSquare,
      accentColor: "#DC2626",
      iconColor: "text-red-600",
      iconBgColor: "bg-red-50",
    },
    {
      id: "this_week",
      title: "Cette semaine",
      description: "Échanges récents",
      icon: CalendarClock,
      accentColor: "#2563EB",
      iconColor: "text-blue-600",
      iconBgColor: "bg-blue-50",
    },
    {
      id: "email_campagne",
      title: "Emails campagne",
      description: "Envois groupés CRM",
      icon: Mail,
      accentColor: "#7C3AED",
      iconColor: "text-violet-600",
      iconBgColor: "bg-violet-50",
    },
    {
      id: "manual",
      title: "Saisies CRM",
      description: "Appels, RDV, notes…",
      icon: Phone,
      accentColor: "#64748B",
      iconColor: "text-slate-600",
      iconBgColor: "bg-slate-50",
    },
  ];

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
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

export function InteractionsToolbar({
  searchQuery,
  onSearchChange,
  typeFilter,
  onTypeChange,
  kindFilter,
  onKindChange,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  typeFilter: string;
  onTypeChange: (value: string) => void;
  kindFilter: ExchangeKindFilter;
  onKindChange: (value: ExchangeKindFilter) => void;
}) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          className="pl-9"
          placeholder="Rechercher contact, sujet, contenu…"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
        />
        {searchQuery && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
            onClick={() => onSearchChange("")}
            aria-label="Effacer la recherche"
          >
            <X className="h-3.5 w-3.5" />
          </Button>
        )}
      </div>
      <Select
        value={kindFilter}
        onValueChange={(v) => onKindChange(v as ExchangeKindFilter)}
      >
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Origine" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes origines</SelectItem>
          <SelectItem value="email_campagne">Emails campagne</SelectItem>
          <SelectItem value="manual">Saisies CRM</SelectItem>
        </SelectContent>
      </Select>
      <Select value={typeFilter} onValueChange={onTypeChange}>
        <SelectTrigger className="w-full sm:w-44">
          <SelectValue placeholder="Type" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Tous les types</SelectItem>
          {INTERACTION_TYPES.map((t) => (
            <SelectItem key={t.value} value={t.value}>
              {t.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function InteractionsContactFilterBanner({
  label,
  onOpenContact,
  onClear,
}: {
  label: string;
  onOpenContact?: () => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
      <span>
        Filtre contact : <strong>{label}</strong>
      </span>
      <div className="flex gap-2">
        {onOpenContact && (
          <Button type="button" variant="outline" size="sm" onClick={onOpenContact}>
            Fiche contact
          </Button>
        )}
        <Button type="button" variant="ghost" size="sm" onClick={onClear}>
          Voir tout le journal
        </Button>
      </div>
    </div>
  );
}

export function InteractionsEmptyState({
  variant,
  onNewInteraction,
  onClearFilters,
}: {
  variant: "empty" | "filtered" | "contact_empty";
  onNewInteraction: () => void;
  onClearFilters?: () => void;
}) {
  const message =
    variant === "empty"
      ? "Aucun échange enregistré pour l'instant."
      : variant === "contact_empty"
        ? "Aucun échange enregistré pour ce contact."
        : "Aucun résultat avec ces filtres.";

  return (
    <div className="text-center py-12 rounded-xl border border-dashed border-border/80 bg-muted/15">
      <p className="text-muted-foreground mb-4">{message}</p>
      <div className="flex flex-wrap justify-center gap-2">
        {variant === "filtered" && onClearFilters && (
          <Button variant="outline" onClick={onClearFilters}>
            Réinitialiser les filtres
          </Button>
        )}
        <Button onClick={onNewInteraction}>
          Nouvelle interaction
        </Button>
      </div>
    </div>
  );
}

export function InteractionsGroupedList({
  groups,
  showSplit,
  selectedEntry,
  onSelect,
}: {
  groups: ExchangeHistoryYearGroup[];
  showSplit: boolean;
  selectedEntry: ExchangeHistoryEntry | null;
  onSelect: (entry: ExchangeHistoryEntry) => void;
}) {
  return (
    <div className="space-y-6">
      {groups.map((yearGroup) => (
        <section key={yearGroup.year} className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground sticky top-0 bg-card/95 backdrop-blur-sm py-1 z-[1]">
            {yearGroup.year}
          </h3>
          {yearGroup.months.map((monthGroup) => (
            <div key={monthGroup.key} className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground/90 px-1">
                {monthGroup.label}
              </p>
              <div className="space-y-2">
                {monthGroup.entries.map((entry) => (
                  <ExchangeHistoryListRow
                    key={exchangeEntryKey(entry)}
                    entry={entry}
                    compact={showSplit}
                    selected={
                      selectedEntry != null &&
                      exchangeEntryKey(selectedEntry) === exchangeEntryKey(entry)
                    }
                    onClick={() => onSelect(entry)}
                  />
                ))}
              </div>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

export function InteractionsActiveFilterChips({
  statFilter,
  kindFilter,
  searchQuery,
  typeFilter,
  onClearStat,
  onClearKind,
  onClearSearch,
  onClearType,
}: {
  statFilter: ExchangeStatFilter | null;
  kindFilter: ExchangeKindFilter;
  searchQuery: string;
  typeFilter: string;
  onClearStat: () => void;
  onClearKind: () => void;
  onClearSearch: () => void;
  onClearType: () => void;
}) {
  const statLabels: Record<ExchangeStatFilter, string> = {
    no_reply: "Sans réponse",
    this_week: "Cette semaine",
    email_campagne: "Emails campagne",
    manual: "Saisies CRM",
  };
  const chips: { key: string; label: string; onClear: () => void }[] = [];
  if (statFilter) {
    chips.push({
      key: "stat",
      label: statLabels[statFilter],
      onClear: onClearStat,
    });
  }
  if (kindFilter !== "all") {
    chips.push({
      key: "kind",
      label: kindFilter === "email_campagne" ? "Emails campagne" : "Saisies CRM",
      onClear: onClearKind,
    });
  }
  if (typeFilter !== "ALL") {
    const typeLabel =
      INTERACTION_TYPES.find((t) => t.value === typeFilter)?.label ?? typeFilter;
    chips.push({ key: "type", label: typeLabel, onClear: onClearType });
  }
  if (searchQuery.trim()) {
    chips.push({
      key: "search",
      label: `« ${searchQuery.trim()} »`,
      onClear: onClearSearch,
    });
  }
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => (
        <Badge
          key={chip.key}
          variant="secondary"
          className="gap-1 pl-2.5 pr-1 py-1 font-normal"
        >
          {chip.label}
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-muted"
            onClick={chip.onClear}
            aria-label={`Retirer le filtre ${chip.label}`}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
    </div>
  );
}
