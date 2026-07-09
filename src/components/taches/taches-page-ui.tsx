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
import { TacheItem } from "@/components/taches/TacheItem";
import type { Tache, TachePriorite, TacheWithContact } from "@/lib/api/tauri-taches";
import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";
import { getTypeAlerteLabel } from "@/lib/alertes/alerte-labels";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import {
  buildTachesActiveFilterChips,
  type TachesActiveFilterId,
} from "@/lib/taches/taches-active-filters";
import type {
  TacheEcheanceStatFilter,
  TacheSection,
  TacheStatutFilter,
} from "@/lib/taches/tache-filters";
import {
  AlertCircle,
  Calendar,
  CalendarClock,
  ChevronDown,
  Clock,
  ListTodo,
  Search,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

export function TachesPageHelp({
  onNavigate,
}: {
  onNavigate?: (page: string) => void;
}) {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <ListTodo className="h-4 w-4 text-primary shrink-0" />
        Tâches manuelles vs relances automatiques
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">Cette page</strong> regroupe vos to-do : titre,
          échéance, priorité, contacts liés. Créez-les ici, depuis une fiche contact, ou via le
          menu « Suite » d&apos;une tâche.
        </p>
        <p>
          <strong className="text-foreground">Les relances auto</strong> (suivi client +1 an,
          prospect jamais contacté, fin démembrement, anniversaire…) sont générées par le CRM et se
          traitent dans{" "}
          {onNavigate ? (
            <button
              type="button"
              className="text-primary underline font-medium"
              onClick={() => navigateToSuivi(onNavigate, "alertes")}
            >
              Suivi → Alertes
            </button>
          ) : (
            "Suivi → Alertes"
          )}
          .
        </p>
      </div>
    </details>
  );
}

export function TachesAlertesBanner({
  alertesCount,
  onNavigate,
}: {
  alertesCount: number;
  onNavigate?: (page: string) => void;
}) {
  if (alertesCount <= 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm">
      <div className="flex items-center gap-2 text-amber-950">
        <AlertCircle className="h-4 w-4 shrink-0" />
        <span>
          <strong>{alertesCount}</strong> alerte{alertesCount > 1 ? "s" : ""} à traiter dans Suivi
        </span>
      </div>
      {onNavigate && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="bg-background"
          onClick={() => navigateToSuivi(onNavigate, "alertes")}
        >
          Ouvrir Suivi → Alertes
        </Button>
      )}
    </div>
  );
}

export function TachesEcheanceStatCards({
  counts,
  activeFilter,
  onFilterChange,
}: {
  counts: Record<TacheEcheanceStatFilter, number>;
  activeFilter: TacheEcheanceStatFilter | null;
  onFilterChange: (filter: TacheEcheanceStatFilter | null) => void;
}) {
  const cards: {
    id: TacheEcheanceStatFilter;
    title: string;
    description: string;
    icon: typeof Clock;
    accentColor: string;
    iconColor: string;
    iconBgColor: string;
  }[] = [
    {
      id: "overdue",
      title: "En retard",
      description: "Échéance dépassée",
      icon: AlertCircle,
      accentColor: "#DC2626",
      iconColor: "text-red-600",
      iconBgColor: "bg-red-50",
    },
    {
      id: "today",
      title: "Aujourd'hui",
      description: "À faire ce jour",
      icon: Calendar,
      accentColor: "#D97706",
      iconColor: "text-amber-600",
      iconBgColor: "bg-amber-50",
    },
    {
      id: "week",
      title: "Demain / semaine",
      description: "7 prochains jours",
      icon: CalendarClock,
      accentColor: "#2563EB",
      iconColor: "text-blue-600",
      iconBgColor: "bg-blue-50",
    },
    {
      id: "none",
      title: "Sans date",
      description: "Backlog sans échéance",
      icon: Clock,
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

export function TachesToolbar({
  searchQuery,
  onSearchChange,
  statutFilter,
  onStatutChange,
  prioriteFilter,
  onPrioriteChange,
  contactFilterOptions,
  contactIdFilter,
  onContactFilterChange,
  bulkMode,
  onBulkModeChange,
}: {
  searchQuery: string;
  onSearchChange: (q: string) => void;
  statutFilter: TacheStatutFilter;
  onStatutChange: (v: TacheStatutFilter) => void;
  prioriteFilter: TachePriorite | "all";
  onPrioriteChange: (v: TachePriorite | "all") => void;
  contactFilterOptions: { id: number; label: string }[];
  contactIdFilter: number | null;
  onContactFilterChange: (id: number | null) => void;
  bulkMode: boolean;
  onBulkModeChange: (v: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="relative flex-1 min-w-[200px] max-w-sm">
        <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Rechercher une tâche…"
          className="pl-9"
        />
      </div>
      <Select value={statutFilter} onValueChange={(v) => onStatutChange(v as TacheStatutFilter)}>
        <SelectTrigger className="w-[130px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ACTIVES">À faire</SelectItem>
          <SelectItem value="FAITES">Faites</SelectItem>
          <SelectItem value="TOUTES">Toutes</SelectItem>
        </SelectContent>
      </Select>
      <Select
        value={prioriteFilter}
        onValueChange={(v) => onPrioriteChange(v as TachePriorite | "all")}
      >
        <SelectTrigger className="w-[130px]">
          <SelectValue placeholder="Priorité" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">Toutes priorités</SelectItem>
          <SelectItem value="HAUTE">Haute</SelectItem>
          <SelectItem value="NORMALE">Normale</SelectItem>
          <SelectItem value="BASSE">Basse</SelectItem>
        </SelectContent>
      </Select>
      {contactFilterOptions.length > 0 && (
        <Select
          value={contactIdFilter != null ? String(contactIdFilter) : "all"}
          onValueChange={(v) =>
            onContactFilterChange(v === "all" ? null : parseInt(v, 10))
          }
        >
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Contact" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Tous les contacts</SelectItem>
            {contactFilterOptions.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
      <Button
        type="button"
        variant={bulkMode ? "secondary" : "outline"}
        size="sm"
        onClick={() => onBulkModeChange(!bulkMode)}
      >
        Sélection
      </Button>
    </div>
  );
}

export function TachesActiveFilterChips({
  chips,
  onRemove,
  onReset,
}: {
  chips: ReturnType<typeof buildTachesActiveFilterChips>;
  onRemove: (id: TachesActiveFilterId) => void;
  onReset: () => void;
}) {
  if (chips.length === 0) return null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {chips.map((chip) => (
        <Badge key={chip.id} variant="secondary" className="gap-1 pr-1">
          {chip.label}
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-muted"
            aria-label={`Retirer ${chip.label}`}
            onClick={() => onRemove(chip.id)}
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      ))}
      <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" onClick={onReset}>
        Réinitialiser
      </Button>
    </div>
  );
}

export function TachesBulkBar({
  count,
  busy,
  onMarkDone,
  onClear,
}: {
  count: number;
  busy: boolean;
  onMarkDone: () => void;
  onClear: () => void;
}) {
  if (count === 0) return null;

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border bg-primary/5 px-3 py-2 text-sm">
      <span>
        {count} tâche{count > 1 ? "s" : ""} sélectionnée{count > 1 ? "s" : ""}
      </span>
      <div className="flex gap-2">
        <Button type="button" size="sm" disabled={busy} onClick={onMarkDone}>
          Marquer faites
        </Button>
        <Button type="button" size="sm" variant="outline" onClick={onClear}>
          Annuler
        </Button>
      </div>
    </div>
  );
}

export function TachesGroupedList({
  sections,
  showContact,
  bulkMode,
  selectedIds,
  onToggleSelect,
  onToggle,
  onEdit,
  onDelete,
  onOpenContact,
  onPlanifierRdv,
  onPostpone,
  onAttachContact,
}: {
  sections: TacheSection[];
  showContact?: boolean;
  bulkMode?: boolean;
  selectedIds?: Set<number>;
  onToggleSelect?: (tache: TacheWithContact) => void;
  onToggle: (tache: TacheWithContact) => void;
  onEdit: (tache: TacheWithContact) => void;
  onDelete: (tache: TacheWithContact) => void;
  onOpenContact?: (contactId: number) => void;
  onPlanifierRdv?: (tache: TacheWithContact) => void;
  onPostpone?: (tache: TacheWithContact, days: number) => void;
  onAttachContact?: (tache: TacheWithContact) => void;
}) {
  return (
    <div className="space-y-5">
      {sections.map((section) => (
        <section key={section.id} className="space-y-2">
          <h2
            className={cn(
              "text-xs font-semibold uppercase tracking-wide",
              section.id === "overdue" && "text-red-600",
              section.id === "today" && "text-amber-700",
              section.id === "done" && "text-muted-foreground"
            )}
          >
            {section.label}
            <span className="ml-1.5 font-normal text-muted-foreground">
              ({section.taches.length})
            </span>
          </h2>
          <div className="space-y-2">
            {section.taches.map((t) => (
              <TacheItem
                key={t.id}
                tache={t}
                showContact={showContact}
                bulkMode={bulkMode}
                bulkSelected={selectedIds?.has(t.id)}
                onBulkSelect={onToggleSelect}
                onToggle={(x) => onToggle(x as TacheWithContact)}
                onEdit={(x) => onEdit(x as TacheWithContact)}
                onDelete={(x) => onDelete(x as TacheWithContact)}
                onOpenContact={onOpenContact}
                onPlanifierRdv={
                  onPlanifierRdv
                    ? (x) => onPlanifierRdv(x as TacheWithContact)
                    : undefined
                }
                onPostpone={
                  onPostpone
                    ? (x, days) => onPostpone(x as TacheWithContact, days)
                    : undefined
                }
                onAttachContact={
                  onAttachContact
                    ? (x) => onAttachContact(x as TacheWithContact)
                    : undefined
                }
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

export function TachesTodayPanel({
  taches,
  alertes,
  onNavigate,
  onOpenContact,
  onToggle,
}: {
  taches: Tache[];
  alertes: AlerteWithContact[];
  onNavigate?: (page: string) => void;
  onOpenContact?: (contactId: number) => void;
  onToggle: (tache: Tache) => void;
}) {
  if (taches.length === 0 && alertes.length === 0) return null;

  return (
    <div className="rounded-xl border border-border/70 bg-muted/20 p-4 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">À traiter aujourd&apos;hui</h2>
          <p className="text-xs text-muted-foreground">
            Tâches en retard ou pour aujourd&apos;hui + alertes Suivi prioritaires
          </p>
        </div>
        {onNavigate && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => navigateToSuivi(onNavigate, "alertes")}
          >
            Suivi → Alertes
          </Button>
        )}
      </div>

      {taches.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Tâches</p>
          {taches.map((t) => (
            <TacheItem
              key={t.id}
              tache={t}
              showContact
              compact
              onToggle={(x) => onToggle(x as Tache)}
              onEdit={() => {}}
              onDelete={() => {}}
              onOpenContact={onOpenContact}
            />
          ))}
        </div>
      )}

      {alertes.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Alertes Suivi</p>
          <ul className="space-y-1.5">
            {alertes.map((a) => (
              <li
                key={a.alerte_id}
                className="flex items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-sm"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">
                    {a.contact_prenom} {a.contact_nom}
                  </p>
                  <p className="text-xs text-muted-foreground truncate">
                    {getTypeAlerteLabel(a.type_alerte)}
                  </p>
                </div>
                {onOpenContact && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onOpenContact(a.contact_id)}
                  >
                    Fiche
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
