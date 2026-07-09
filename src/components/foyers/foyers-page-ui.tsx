import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/dashboard/StatCard";
import { ListSearchField } from "@/components/layout";
import type { FoyerSortId, FoyerStatFilter } from "@/lib/foyers/foyers-search";
import { getFoyerTypeLabel } from "@/lib/foyers/foyer-display";
import {
  Building2,
  ChevronDown,
  Download,
  Filter,
  Heart,
  Home,
  Users,
  X,
} from "lucide-react";

export function FoyersPageHelp() {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <Home className="h-4 w-4 text-primary shrink-0" />
        Foyer vs Familles — comment lire cette page
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">Cette page</strong> liste les{" "}
          <strong className="text-foreground">foyers fiscaux</strong> : personnes qui déclarent
          ensemble (couple, famille avec enfants…), même si les noms diffèrent.
        </p>
        <p>
          <strong className="text-foreground">Page Familles</strong> regroupe les homonymes ou une
          famille créée manuellement — c&apos;est distinct du foyer conjugal.
        </p>
        <p>
          Cliquez sur une carte pour voir les membres.{" "}
          <strong className="text-foreground">Fiche complète</strong> ouvre investissements,
          fiscalité détaillée et notes. Le bouton <strong className="text-foreground">Fiche</strong>{" "}
          ouvre un membre en contact.
        </p>
      </div>
    </details>
  );
}

export function FoyersStatCards({
  totalCount,
  emptyCount,
  withPatrimoineCount,
  coupleCount,
  contactsRattaches,
  activeFilter,
  onFilterChange,
}: {
  totalCount: number;
  emptyCount: number;
  withPatrimoineCount: number;
  coupleCount: number;
  contactsRattaches: number;
  activeFilter: FoyerStatFilter | null;
  onFilterChange: (filter: FoyerStatFilter | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Foyers"
        value={totalCount}
        description="Unités fiscales"
        icon={Home}
        accentColor="#b45309"
        iconColor="text-amber-700"
        iconBgColor="bg-amber-50"
        highlight={activeFilter == null}
        onClick={() => onFilterChange(null)}
      />
      <StatCard
        title="Sans membre"
        value={emptyCount}
        description="À compléter"
        icon={Users}
        accentColor="#dc2626"
        iconColor="text-red-700"
        iconBgColor="bg-red-50"
        highlight={activeFilter === "empty"}
        onClick={() => onFilterChange(activeFilter === "empty" ? null : "empty")}
      />
      <StatCard
        title="Couples"
        value={coupleCount}
        description="Type couple"
        icon={Heart}
        accentColor="#6d28d9"
        iconColor="text-violet-700"
        iconBgColor="bg-violet-50"
        highlight={activeFilter === "couple"}
        onClick={() => onFilterChange(activeFilter === "couple" ? null : "couple")}
      />
      <StatCard
        title="Contacts rattachés"
        value={contactsRattaches}
        description={
          withPatrimoineCount > 0
            ? `${withPatrimoineCount} foyer(s) avec patrimoine`
            : "Liés à un foyer"
        }
        icon={Building2}
        accentColor="#047857"
        iconColor="text-emerald-700"
        iconBgColor="bg-emerald-50"
        highlight={activeFilter === "with_patrimoine"}
        onClick={() =>
          onFilterChange(activeFilter === "with_patrimoine" ? null : "with_patrimoine")
        }
      />
    </div>
  );
}

export function FoyersToolbar({
  searchQuery,
  onSearchChange,
  sortId,
  onSortChange,
  typeFilter,
  onTypeFilterChange,
  statFilter,
  onClearStatFilter,
  onExportCsv,
  showExport,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortId: FoyerSortId;
  onSortChange: (sortId: FoyerSortId) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  statFilter: FoyerStatFilter | null;
  onClearStatFilter: () => void;
  onExportCsv?: () => void;
  showExport?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2.5 shadow-sm">
      <ListSearchField
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Nom du foyer ou membre…"
        className="flex-1 min-w-[220px] max-w-xl"
      />
      <Select value={sortId} onValueChange={(v) => onSortChange(v as FoyerSortId)}>
        <SelectTrigger className="w-[180px] shrink-0">
          <SelectValue placeholder="Tri" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="patrimoine_desc">Patrimoine ↓</SelectItem>
          <SelectItem value="membres_desc">Membres ↓</SelectItem>
          <SelectItem value="name_asc">Nom A→Z</SelectItem>
        </SelectContent>
      </Select>
      <Select value={typeFilter} onValueChange={onTypeFilterChange}>
        <SelectTrigger className="w-[180px] shrink-0">
          <Filter className="h-4 w-4 mr-2 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="ALL">Tous les types</SelectItem>
          <SelectItem value="COUPLE">Couples</SelectItem>
          <SelectItem value="FAMILLE">Avec enfant(s)</SelectItem>
          <SelectItem value="CELIBATAIRE">Célibataires</SelectItem>
          <SelectItem value="DIVORCE">Divorcé(e)s</SelectItem>
          <SelectItem value="VEUF">Veuf(ve)s</SelectItem>
        </SelectContent>
      </Select>
      {statFilter && (
        <Badge variant="secondary" className="gap-1 pr-1">
          Filtre actif
          <button
            type="button"
            className="rounded-sm p-0.5 hover:bg-muted"
            onClick={onClearStatFilter}
            aria-label="Retirer le filtre"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {typeFilter !== "ALL" && (
        <Badge variant="outline" className="gap-1 pr-1 text-xs font-normal">
          {getFoyerTypeLabel(typeFilter)}
          <button
            type="button"
            className="rounded-sm p-0.5 hover:bg-muted"
            onClick={() => onTypeFilterChange("ALL")}
            aria-label="Retirer filtre type"
          >
            <X className="h-3 w-3" />
          </button>
        </Badge>
      )}
      {showExport && onExportCsv && (
        <Button type="button" variant="outline" size="sm" onClick={onExportCsv}>
          <Download className="h-4 w-4 mr-1.5" />
          CSV
        </Button>
      )}
    </div>
  );
}
