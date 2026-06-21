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
import type {
  PrescripteurSortId,
  PrescripteurStatFilter,
} from "@/lib/prescripteurs/prescripteur-search";
import {
  ChevronDown,
  Download,
  Share2,
  TrendingUp,
  UnfoldHorizontal,
  Users,
  X,
} from "lucide-react";

export function PrescripteursPageHelp() {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <Share2 className="h-4 w-4 text-primary shrink-0" />
        Comment lire l&apos;arbre prescripteur
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">Cliquez sur une carte</strong> pour déplier son arbre
          de recommandations directement dans la liste. Le bouton{" "}
          <strong className="text-foreground">Modifier</strong> ouvre la fiche contact du
          prescripteur.
        </p>
        <p>
          Dans l&apos;arbre, <strong className="text-foreground">cliquez sur un nom</strong> pour
          déplier ou replier la branche. Le bouton{" "}
          <strong className="text-foreground">Fiche</strong> ouvre le contact concerné.{" "}
          <strong className="text-foreground">Retirer du réseau</strong> coupe le lien prescripteur
          sans supprimer le contact ; <strong className="text-foreground">Supprimer</strong> efface
          le contact.
        </p>
        <p>
          La recherche porte sur <strong className="text-foreground">tout le réseau</strong>, pas
          seulement les racines. Depuis une fiche contact → Couple / foyer, le bouton « Voir le
          réseau » ouvre cette page sur la bonne branche.
        </p>
      </div>
    </details>
  );
}

export function PrescripteursStatCards({
  racineCount,
  rootsWithClients,
  rootsWithoutClients,
  totalPatrimoineLabel,
  activeFilter,
  onFilterChange,
}: {
  racineCount: number;
  rootsWithClients: number;
  rootsWithoutClients: number;
  totalPatrimoineLabel: string;
  activeFilter: PrescripteurStatFilter | null;
  onFilterChange: (filter: PrescripteurStatFilter | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <StatCard
        title="Prescripteurs actifs"
        value={racineCount}
        description="Racines de l'arbre (sans prescripteur amont)"
        icon={Share2}
        accentColor="#6d28d9"
        iconColor="text-violet-700"
        iconBgColor="bg-violet-50"
        highlight={activeFilter == null}
        onClick={() => onFilterChange(null)}
      />
      <StatCard
        title="Avec clients"
        value={rootsWithClients}
        description={
          rootsWithoutClients > 0
            ? `${rootsWithoutClients} sans client recommandé`
            : "Au moins un recommandé"
        }
        icon={Users}
        accentColor="#1d4ed8"
        iconColor="text-blue-700"
        iconBgColor="bg-blue-50"
        highlight={activeFilter === "with_clients"}
        onClick={() =>
          onFilterChange(activeFilter === "with_clients" ? null : "with_clients")
        }
      />
      <StatCard
        title="Patrimoine apporté"
        value={totalPatrimoineLabel}
        description="Hors patrimoine personnel des racines"
        icon={TrendingUp}
        accentColor="#047857"
        iconColor="text-emerald-700"
        iconBgColor="bg-emerald-50"
      />
    </div>
  );
}

export function PrescripteursToolbar({
  searchQuery,
  onSearchChange,
  sortId,
  onSortChange,
  statFilter,
  onClearStatFilter,
  onExpandAll,
  onCollapseAll,
  onExportCsv,
  showTreeControls,
}: {
  searchQuery: string;
  onSearchChange: (value: string) => void;
  sortId: PrescripteurSortId;
  onSortChange: (sortId: PrescripteurSortId) => void;
  statFilter: PrescripteurStatFilter | null;
  onClearStatFilter: () => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onExportCsv?: () => void;
  showTreeControls?: boolean;
}) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background/95 px-3 py-2.5 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
      <ListSearchField
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Nom, foyer ou membre du réseau…"
        className="flex-1 min-w-[220px] max-w-xl"
      />
      <Select value={sortId} onValueChange={(v) => onSortChange(v as PrescripteurSortId)}>
        <SelectTrigger className="w-[180px] shrink-0">
          <SelectValue placeholder="Tri" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="patrimoine_desc">Patrimoine ↓</SelectItem>
          <SelectItem value="clients_desc">Clients ↓</SelectItem>
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
      {showTreeControls && (
        <>
          <Button type="button" variant="outline" size="sm" onClick={onExpandAll}>
            <UnfoldHorizontal className="h-4 w-4 mr-1.5" />
            Tout déplier
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={onCollapseAll}>
            Replier
          </Button>
          {onExportCsv && (
            <Button type="button" variant="outline" size="sm" onClick={onExportCsv}>
              <Download className="h-4 w-4 mr-1.5" />
              CSV
            </Button>
          )}
        </>
      )}
    </div>
  );
}
