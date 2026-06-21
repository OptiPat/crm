import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { StatCard } from "@/components/dashboard/StatCard";
import { InvestissementCard } from "@/components/investissements/InvestissementCard";
import { InvestissementPatrimoineActions } from "@/components/investissements/InvestissementPatrimoineActions";
import { PatrimoineCategoryBlock } from "@/components/investissements/PatrimoineCategoryBlock";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { computeEncoursPlacementsStats } from "@/lib/investissements/investissement-encours";
import { computeVersementsProgrammesAnnuelStats } from "@/lib/investissements/investissement-versements";
import { InvestissementEncoursDialog } from "@/components/investissements/InvestissementEncoursDialog";
import {
  type InvestissementWithOwner,
  type PatrimoineOrigineFilter,
  type PatrimoineOwnerFilter,
  computePatrimoineStats,
  filterByOrigine,
  filterByOwner,
  filterPatrimoineSearch,
  groupPatrimoineByCategory,
} from "@/lib/investissements/patrimoine-tab-utils";
import { cn } from "@/lib/utils";
import {
  Building2,
  FileUp,
  Home,
  Plus,
  Search,
  TrendingUp,
  CalendarClock,
  Wallet,
  X,
} from "lucide-react";

const ORIGINE_FILTERS: { id: PatrimoineOrigineFilter; label: string }[] = [
  { id: "all", label: "Tous" },
  { id: "avec_moi", label: "Avec moi" },
  { id: "a_cote", label: "À côté" },
];

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border/80 bg-card text-muted-foreground hover:bg-muted/50"
      )}
    >
      {label}
      {count != null && count > 0 && (
        <span
          className={cn(
            "tabular-nums rounded-full px-1.5 py-0.5 text-[10px]",
            active ? "bg-primary/15" : "bg-muted"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

function PatrimoineSection({
  title,
  icon: Icon,
  accentClass,
  totalCentimes,
  items,
  contactId,
  getPartenaireNom,
  onEdit,
  onDelete,
  onEncours,
  onOpenOwnerContact,
  onViewPartenaire,
}: {
  title: string;
  icon: typeof Home;
  accentClass: string;
  totalCentimes: number;
  items: InvestissementWithOwner[];
  contactId: number;
  getPartenaireNom: (id?: number) => string | null;
  onEdit: (inv: Investissement) => void;
  onDelete: (inv: Investissement) => void;
  onEncours?: (inv: Investissement) => void;
  onOpenOwnerContact?: (contactId: number) => void;
  onViewPartenaire?: (partenaireId: number, investissementId?: number) => void;
}) {
  if (items.length === 0) return null;

  return (
    <PatrimoineCategoryBlock
      title={title}
      icon={Icon}
      accentClass={accentClass}
      totalCentimes={totalCentimes}
      count={items.length}
    >
      {items.map((inv) => {
          const ownerContactId =
            inv._proprietaireId != null &&
            inv._proprietaireId > 0 &&
            inv._proprietaire !== "Foyer"
              ? inv._proprietaireId
              : null;

          return (
          <InvestissementCard
            key={`${inv.id}-${inv._proprietaire ?? "self"}`}
            inv={inv}
            partenaireNom={getPartenaireNom(inv.partenaire_id)}
            proprietaireLabel={inv._proprietaire}
            proprietaireVariant={
              inv._proprietaireId === contactId
                ? "self"
                : inv._proprietaire === "Foyer"
                  ? "foyer"
                  : "member"
            }
            onProprietaireClick={
              onOpenOwnerContact &&
              ownerContactId != null &&
              ownerContactId !== contactId
                ? () => onOpenOwnerContact(ownerContactId)
                : undefined
            }
            onOpenContactClick={() => onEdit(inv)}
            onPartenaireClick={
              onViewPartenaire && inv.partenaire_id != null
                ? () => onViewPartenaire(inv.partenaire_id!, inv.id)
                : undefined
            }
            actions={
              <InvestissementPatrimoineActions
                inv={inv}
                onEdit={onEdit}
                onDelete={onDelete}
                onEncours={onEncours}
                compact
              />
            }
          />
          );
        })}
    </PatrimoineCategoryBlock>
  );
}

export function ContactPatrimoinePanel({
  contactId,
  contactPrenom,
  contactNom,
  hasFoyer,
  investissements,
  loading,
  getPartenaireNom,
  onAdd,
  onEdit,
  onDelete,
  onRefresh,
  onOpenOwnerContact,
  onNavigateDocuments,
  onImportDocument,
  onViewPartenaire,
}: {
  contactId: number;
  contactPrenom: string;
  contactNom: string;
  hasFoyer: boolean;
  investissements: InvestissementWithOwner[];
  loading: boolean;
  getPartenaireNom: (partenaireId?: number) => string | null;
  onAdd: () => void;
  onEdit: (inv: Investissement) => void;
  onDelete: (inv: Investissement) => void;
  onRefresh: () => void;
  onOpenOwnerContact?: (contactId: number) => void;
  onNavigateDocuments?: () => void;
  onImportDocument?: () => void;
  onViewPartenaire?: (partenaireId: number, investissementId?: number) => void;
}) {
  const [searchQuery, setSearchQuery] = useState("");
  const [origineFilter, setOrigineFilter] = useState<PatrimoineOrigineFilter>("all");
  const [ownerFilter, setOwnerFilter] = useState<PatrimoineOwnerFilter>("all");
  const [encoursInvestissement, setEncoursInvestissement] =
    useState<Investissement | null>(null);

  const resetFilters = () => {
    setSearchQuery("");
    setOrigineFilter("all");
    setOwnerFilter("all");
  };

  useEffect(() => {
    setSearchQuery("");
    setOrigineFilter("all");
    setOwnerFilter("all");
  }, [contactId]);

  const hasActiveFilters =
    searchQuery.trim() !== "" ||
    origineFilter !== "all" ||
    ownerFilter !== "all";

  const stats = useMemo(
    () => computePatrimoineStats(investissements),
    [investissements]
  );

  const encoursStats = useMemo(
    () => computeEncoursPlacementsStats(investissements),
    [investissements]
  );

  const versementsStats = useMemo(
    () => computeVersementsProgrammesAnnuelStats(investissements),
    [investissements]
  );

  const showOwnerFilters = hasFoyer && investissements.length > 0;

  const filtered = useMemo(() => {
    let list = investissements;
    list = filterByOwner(list, ownerFilter, contactId);
    list = filterByOrigine(list, origineFilter);
    list = filterPatrimoineSearch(list, searchQuery, getPartenaireNom);
    return list;
  }, [
    investissements,
    ownerFilter,
    contactId,
    origineFilter,
    searchQuery,
    getPartenaireNom,
  ]);

  const { immobilier, financier } = useMemo(
    () => groupPatrimoineByCategory(filtered),
    [filtered]
  );

  const immoTotal = immobilier.reduce((s, i) => s + (i.montant_initial ?? 0), 0);
  const finTotal = financier.reduce((s, i) => s + (i.montant_initial ?? 0), 0);
  const filteredTotalCentimes = filtered.reduce(
    (s, i) => s + (i.montant_initial ?? 0),
    0
  );
  const filteredEncoursTotal = useMemo(
    () =>
      computeEncoursPlacementsStats(filtered, { avecMoiOnly: false }).encoursCentimes,
    [filtered]
  );
  const showFlatList =
    filtered.length > 0 && immobilier.length === 0 && financier.length === 0;

  const countByOrigine = useMemo(
    () => ({
      all: investissements.length,
      avec_moi: investissements.filter((i) => i.origine === "MON_CONSEIL").length,
      a_cote: investissements.filter((i) => i.origine !== "MON_CONSEIL").length,
    }),
    [investissements]
  );

  const hasACote = stats.countACote > 0;

  useEffect(() => {
    if (!hasACote && origineFilter === "a_cote") {
      setOrigineFilter("all");
    }
  }, [hasACote, origineFilter]);

  return (
    <div className="space-y-4">
      <div className="grid gap-2 grid-cols-1 sm:grid-cols-3">
        <StatCard
          title="Avec moi"
          value={formatEuroCentimes(stats.avecMoiCentimes)}
          description={`${stats.countAvecMoi} support${stats.countAvecMoi > 1 ? "s" : ""} — conseil`}
          icon={TrendingUp}
          accentColor="#dc216e"
          iconColor="text-rose-700"
          iconBgColor="bg-rose-50"
          highlight={origineFilter === "avec_moi"}
          onClick={() =>
            setOrigineFilter((f) => (f === "avec_moi" ? "all" : "avec_moi"))
          }
        />
        <StatCard
          title="Encours placements"
          value={formatEuroCentimes(encoursStats.encoursCentimes)}
          description="AV, PER, FIP/FCPI… — avec moi"
          icon={TrendingUp}
          accentColor="#C9A227"
          iconColor="text-amber-600"
          iconBgColor="bg-amber-50"
        />
        <StatCard
          title="Versements programmés"
          value={formatEuroCentimes(versementsStats.annuelCentimes)}
          description="Montant annuel — avec moi"
          icon={CalendarClock}
          accentColor="#3B82F6"
          iconColor="text-blue-600"
          iconBgColor="bg-blue-50"
        />
      </div>

      <Card className="border-primary/15 shadow-sm">
        <CardHeader className="pb-3">
          <div className="space-y-2 min-w-0">
            <div className="min-w-0">
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="h-5 w-5 shrink-0 text-primary" />
                <span className="truncate">
                  Patrimoine de {contactPrenom} {contactNom}
                </span>
              </CardTitle>
              {onNavigateDocuments && (
                <button
                  type="button"
                  className="mt-1 text-sm text-primary hover:underline"
                  onClick={onNavigateDocuments}
                >
                  Voir les documents
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" className="gap-1.5" onClick={onAdd}>
                <Plus className="h-4 w-4" />
                Ajouter
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: "#85ad39" }}
              />
              Immobilier
            </span>
            <span className="inline-flex items-center gap-1">
              <span
                className="h-2.5 w-2.5 rounded-sm"
                style={{ backgroundColor: "#dc216e" }}
              />
              Placements financiers
            </span>
            {hasACote && (
              <span className="inline-flex items-center gap-1">
                <span className="h-2.5 w-2.5 rounded-sm bg-gray-400" />
                À côté (badge gris)
              </span>
            )}
          </div>

          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Rechercher un produit, partenaire…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery("")}
                  aria-label="Effacer la recherche"
                >
                  <X className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {ORIGINE_FILTERS.filter((f) => f.id !== "a_cote" || hasACote).map((f) => (
              <FilterPill
                key={f.id}
                active={origineFilter === f.id}
                label={f.label}
                count={countByOrigine[f.id]}
                onClick={() => setOrigineFilter(f.id)}
              />
            ))}
          </div>

          {showOwnerFilters && (
            <div className="flex flex-wrap gap-2 pt-1 border-t border-dashed border-border/60">
              <span className="text-xs text-muted-foreground w-full mb-0.5">
                Déteneur
              </span>
              <FilterPill
                active={ownerFilter === "all"}
                label="Tous"
                onClick={() => setOwnerFilter("all")}
              />
              <FilterPill
                active={ownerFilter === "self"}
                label="Ce contact"
                onClick={() => setOwnerFilter("self")}
              />
              <FilterPill
                active={ownerFilter === "foyer"}
                label="Foyer commun"
                onClick={() => setOwnerFilter("foyer")}
              />
              <FilterPill
                active={ownerFilter === "members"}
                label="Autres membres"
                onClick={() => setOwnerFilter("members")}
              />
            </div>
          )}

          {loading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Chargement du patrimoine…
            </p>
          ) : investissements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/25 px-6 py-10 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">Aucun investissement enregistré</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
                Importez un RIO ou relevé patrimonial pour préremplir la fiche et le patrimoine,
                ou saisissez un placement manuellement.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {onImportDocument && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={onImportDocument}
                  >
                    <FileUp className="h-4 w-4" />
                    Importer
                  </Button>
                )}
                <Button type="button" size="sm" className="gap-1" onClick={onAdd}>
                  <Plus className="h-4 w-4" />
                  Ajouter un placement
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border/70 bg-muted/30 px-3 py-2">
                <p className="text-sm font-medium text-foreground">
                  <span className="tabular-nums">{filtered.length}</span> placement
                  {filtered.length > 1 ? "s" : ""} affiché{filtered.length > 1 ? "s" : ""}
                  {hasActiveFilters && (
                    <span className="text-muted-foreground font-normal">
                      {" "}
                      sur {investissements.length}
                    </span>
                  )}
                  <span className="text-muted-foreground font-normal ml-2 tabular-nums">
                    souscrit {formatEuroCentimes(filteredTotalCentimes)}
                    {filteredEncoursTotal > 0 && (
                      <>
                        {" "}
                        · encours {formatEuroCentimes(filteredEncoursTotal)}
                      </>
                    )}
                  </span>
                </p>
                {hasActiveFilters && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    onClick={resetFilters}
                  >
                    Réinitialiser les filtres
                  </Button>
                )}
              </div>

              {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-amber-200/80 bg-amber-50/40 px-4 py-8 text-center space-y-3">
                  <p className="text-sm font-medium text-foreground">
                    Aucun placement ne correspond à ces filtres
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {investissements.length} placement
                    {investissements.length > 1 ? "s" : ""} enregistré
                    {investissements.length > 1 ? "s" : ""} au total — cliquez sur
                    les cartes du haut ou réinitialisez.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={resetFilters}
                  >
                    Tout afficher
                  </Button>
                </div>
              ) : (
                <div className="space-y-6">
                  <PatrimoineSection
                    title="Immobilier"
                    icon={Home}
                    accentClass="bg-[#85ad39]/15 text-[#5a7a28]"
                    totalCentimes={immoTotal}
                    items={immobilier}
                    contactId={contactId}
                    getPartenaireNom={getPartenaireNom}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onEncours={(inv) => setEncoursInvestissement(inv)}
                    onOpenOwnerContact={onOpenOwnerContact}
                    onViewPartenaire={onViewPartenaire}
                  />
                  <PatrimoineSection
                    title="Placements financiers"
                    icon={TrendingUp}
                    accentClass="bg-rose-50 text-rose-700"
                    totalCentimes={finTotal}
                    items={financier}
                    contactId={contactId}
                    getPartenaireNom={getPartenaireNom}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onEncours={(inv) => setEncoursInvestissement(inv)}
                    onOpenOwnerContact={onOpenOwnerContact}
                    onViewPartenaire={onViewPartenaire}
                  />
                  {showFlatList && (
                    <div className="space-y-2">
                      {filtered.map((inv) => {
                        const ownerContactId =
                          inv._proprietaireId != null &&
                          inv._proprietaireId > 0 &&
                          inv._proprietaire !== "Foyer"
                            ? inv._proprietaireId
                            : null;

                        return (
                        <InvestissementCard
                          key={`flat-${inv.id}-${inv._proprietaire ?? "self"}`}
                          inv={inv}
                          partenaireNom={getPartenaireNom(inv.partenaire_id)}
                          proprietaireLabel={inv._proprietaire}
                          proprietaireVariant={
                            inv._proprietaireId === contactId
                              ? "self"
                              : inv._proprietaire === "Foyer"
                                ? "foyer"
                                : "member"
                          }
                          onProprietaireClick={
                            onOpenOwnerContact &&
                            ownerContactId != null &&
                            ownerContactId !== contactId
                              ? () => onOpenOwnerContact(ownerContactId)
                              : undefined
                          }
                          onOpenContactClick={() => onEdit(inv)}
                          onPartenaireClick={
                            onViewPartenaire && inv.partenaire_id != null
                              ? () => onViewPartenaire(inv.partenaire_id!, inv.id)
                              : undefined
                          }
                          actions={
                            <InvestissementPatrimoineActions
                              inv={inv}
                              onEdit={onEdit}
                              onDelete={onDelete}
                              onEncours={(item) => setEncoursInvestissement(item)}
                              compact
                            />
                          }
                        />
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <InvestissementEncoursDialog
        open={encoursInvestissement != null}
        onOpenChange={(open) => {
          if (!open) setEncoursInvestissement(null);
        }}
        investissement={encoursInvestissement}
        onUpdated={onRefresh}
      />
    </div>
  );
}
