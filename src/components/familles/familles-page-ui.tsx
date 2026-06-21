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
import type { FamilleSortId, FamilleStatFilter } from "@/lib/familles/familles-search";
import {
  ChevronDown,
  Download,
  Home,
  TreePine,
  Users,
  Users2,
  X,
} from "lucide-react";

export function FamillesPageHelp() {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <TreePine className="h-4 w-4 text-primary shrink-0" />
        Famille vs foyer — comment lire cette page
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">Cette page</strong> regroupe les contacts par{" "}
          <strong className="text-foreground">nom de famille</strong> (homonymes automatiques)
          ou une <strong className="text-foreground">famille créée manuellement</strong>.
          Les conjoints d&apos;un autre nom apparaissent à côté de leur époux(se).
        </p>
        <p>
          <strong className="text-foreground">Fiche contact → Couple / foyer</strong> gère le
          foyer conjugal (même adresse, patrimoine commun) — c&apos;est distinct du regroupement
          par nom ici.
        </p>
        <p>
          Cliquez sur une carte pour voir les membres. Le bouton{" "}
          <strong className="text-foreground">Fiche</strong> ouvre le contact. L&apos;icône −
          retire un homonyme du regroupement auto ou un membre d&apos;une famille manuelle.
        </p>
      </div>
    </details>
  );
}

export function FamillesStatCards({
  totalCount,
  manualCount,
  autoCount,
  withFoyerCount,
  activeFilter,
  onFilterChange,
}: {
  totalCount: number;
  manualCount: number;
  autoCount: number;
  withFoyerCount: number;
  activeFilter: FamilleStatFilter | null;
  onFilterChange: (filter: FamilleStatFilter | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Familles"
        value={totalCount}
        description="Regroupements actifs"
        icon={Users2}
        accentColor="#1d4ed8"
        iconColor="text-blue-700"
        iconBgColor="bg-blue-50"
        highlight={activeFilter == null}
        onClick={() => onFilterChange(null)}
      />
      <StatCard
        title="Manuelles"
        value={manualCount}
        description="Créées par vous"
        icon={TreePine}
        accentColor="#6d28d9"
        iconColor="text-violet-700"
        iconBgColor="bg-violet-50"
        highlight={activeFilter === "manual"}
        onClick={() =>
          onFilterChange(activeFilter === "manual" ? null : "manual")
        }
      />
      <StatCard
        title="Automatiques"
        value={autoCount}
        description="2+ homonymes"
        icon={Users}
        accentColor="#047857"
        iconColor="text-emerald-700"
        iconBgColor="bg-emerald-50"
        highlight={activeFilter === "auto"}
        onClick={() => onFilterChange(activeFilter === "auto" ? null : "auto")}
      />
      <StatCard
        title="Avec foyer"
        value={withFoyerCount}
        description="Au moins un foyer lié"
        icon={Home}
        accentColor="#b45309"
        iconColor="text-amber-700"
        iconBgColor="bg-amber-50"
        highlight={activeFilter === "with_foyer"}
        onClick={() =>
          onFilterChange(activeFilter === "with_foyer" ? null : "with_foyer")
        }
      />
    </div>
  );
}

export function FamillesToolbar({
  searchQuery,
  onSearchChange,
  sortId,
  onSortChange,
  statFilter,
  onClearStatFilter,
  onExportCsv,
  showExport,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortId: FamilleSortId;
  onSortChange: (sortId: FamilleSortId) => void;
  statFilter: FamilleStatFilter | null;
  onClearStatFilter: () => void;
  onExportCsv?: () => void;
  showExport?: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ListSearchField
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Nom de famille ou membre…"
        className="flex-1 min-w-[220px] max-w-xl"
      />
      <Select value={sortId} onValueChange={(v) => onSortChange(v as FamilleSortId)}>
        <SelectTrigger className="w-[180px] shrink-0">
          <SelectValue placeholder="Tri" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="patrimoine_desc">Patrimoine ↓</SelectItem>
          <SelectItem value="membres_desc">Membres ↓</SelectItem>
          <SelectItem value="name_asc">Nom A→Z</SelectItem>
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
      {showExport && onExportCsv && (
        <Button type="button" variant="outline" size="sm" onClick={onExportCsv}>
          <Download className="h-4 w-4 mr-1.5" />
          CSV
        </Button>
      )}
    </div>
  );
}
