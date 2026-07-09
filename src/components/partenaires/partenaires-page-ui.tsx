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
import {
  PARTENAIRE_TYPE_FILTER_OPTIONS,
  getPartenaireTypeInfo,
} from "@/lib/partenaires/partenaire-display";
import type {
  PartenaireSortId,
  PartenaireStatFilter,
} from "@/lib/partenaires/partenaires-search";
import {
  Building2,
  ChevronDown,
  Download,
  Filter,
  Handshake,
  Home,
  Shield,
  Wallet,
  X,
} from "lucide-react";

export function PartenairesPageHelp() {
  return (
    <details className="group rounded-xl border bg-muted/20 text-sm">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 font-medium [&::-webkit-details-marker]:hidden">
        <Handshake className="h-4 w-4 text-primary shrink-0" />
        Partenaire vs produit investissement
        <ChevronDown className="h-4 w-4 ml-auto text-muted-foreground transition-transform group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 space-y-2 text-xs text-muted-foreground leading-relaxed border-t pt-3">
        <p>
          <strong className="text-foreground">Cette page</strong> répertorie vos{" "}
          <strong className="text-foreground">partenaires professionnels</strong> : assureurs,
          sociétés de gestion SCPI, capital investissement, promoteurs…
        </p>
        <p>
          Chaque <strong className="text-foreground">produit lié</strong> est un investissement
          client rattaché à ce partenaire (contrat, parts SCPI, etc.) — ce n&apos;est pas une
          famille ni un foyer fiscal.
        </p>
        <p>
          Cliquez sur une carte pour voir les produits.{" "}
          <strong className="text-foreground">Modifier</strong> change le nom et le type ;{" "}
          <strong className="text-foreground">Fiche complète</strong> ouvre coordonnées,
          collaboration, notes et suppression. Le bouton <strong className="text-foreground">Fiche</strong>{" "}
          ouvre le contact client.
        </p>
      </div>
    </details>
  );
}

export function PartenairesStatCards({
  totalCount,
  promoteurCount,
  withEncoursCount,
  assureurCount,
  scpiCount,
  totalProduitsLies,
  activeFilter,
  onFilterChange,
}: {
  totalCount: number;
  promoteurCount: number;
  withEncoursCount: number;
  assureurCount: number;
  scpiCount: number;
  totalProduitsLies: number;
  activeFilter: PartenaireStatFilter | null;
  onFilterChange: (filter: PartenaireStatFilter | null) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard
        title="Partenaires"
        value={totalCount}
        description={`${totalProduitsLies} produit(s) lié(s)`}
        icon={Building2}
        accentColor="#1d4ed8"
        iconColor="text-blue-700"
        iconBgColor="bg-blue-50"
        highlight={activeFilter == null}
        onClick={() => onFilterChange(null)}
      />
      <StatCard
        title="Promoteurs"
        value={promoteurCount}
        description="Acteurs immobiliers"
        icon={Home}
        accentColor="#ea580c"
        iconColor="text-orange-700"
        iconBgColor="bg-orange-50"
        highlight={activeFilter === "promoteur"}
        onClick={() => onFilterChange(activeFilter === "promoteur" ? null : "promoteur")}
      />
      <StatCard
        title="Assureurs"
        value={assureurCount}
        description={
          withEncoursCount > 0
            ? `${withEncoursCount} avec encours conseil`
            : "Type assureur"
        }
        icon={Shield}
        accentColor="#047857"
        iconColor="text-emerald-700"
        iconBgColor="bg-emerald-50"
        highlight={activeFilter === "assureur"}
        onClick={() => onFilterChange(activeFilter === "assureur" ? null : "assureur")}
      />
      <StatCard
        title="Gestion SCPI/Capital Invest"
        value={scpiCount}
        description="Sociétés de gestion"
        icon={Wallet}
        accentColor="#6d28d9"
        iconColor="text-violet-700"
        iconBgColor="bg-violet-50"
        highlight={activeFilter === "scpi"}
        onClick={() => onFilterChange(activeFilter === "scpi" ? null : "scpi")}
      />
    </div>
  );
}

export function PartenairesToolbar({
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
  sortId: PartenaireSortId;
  onSortChange: (sortId: PartenaireSortId) => void;
  typeFilter: string;
  onTypeFilterChange: (value: string) => void;
  statFilter: PartenaireStatFilter | null;
  onClearStatFilter: () => void;
  onExportCsv?: () => void;
  showExport?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border/60 bg-background px-3 py-2.5 shadow-sm">
      <ListSearchField
        value={searchQuery}
        onChange={onSearchChange}
        placeholder="Partenaire, produit, contact…"
        className="flex-1 min-w-[220px] max-w-xl"
      />
      <Select value={sortId} onValueChange={(v) => onSortChange(v as PartenaireSortId)}>
        <SelectTrigger className="w-[180px] shrink-0">
          <SelectValue placeholder="Tri" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="encours_desc">Encours ↓</SelectItem>
          <SelectItem value="produits_desc">Produits ↓</SelectItem>
          <SelectItem value="name_asc">Nom A→Z</SelectItem>
        </SelectContent>
      </Select>
      <Select value={typeFilter} onValueChange={onTypeFilterChange}>
        <SelectTrigger className="w-[200px] shrink-0">
          <Filter className="h-4 w-4 mr-2 shrink-0" />
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {PARTENAIRE_TYPE_FILTER_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
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
          {getPartenaireTypeInfo(typeFilter).label}
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
