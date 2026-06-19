import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Plus, Search, Filter, Trash2, Pencil, TrendingUp, CalendarClock, Download, Percent, RefreshCw } from "lucide-react";
import { rowsToCsv, downloadCsvFile } from "@/lib/export/csv-export";
import {
  getInvestissementsWithDetails,
  deleteInvestissement,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";
import { InvestissementEncoursDialog } from "@/components/investissements/InvestissementEncoursDialog";
import { InvestissementCard } from "@/components/investissements/InvestissementCard";
import { formatCalendarDateFr } from "@/lib/dates/calendar-date";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  computeEncoursPlacementsStats,
  isPlacementEncoursEligible,
} from "@/lib/investissements/investissement-encours";
import {
  computeAvPerVersementProgrammeCoverageStats,
  computeVersementsProgrammesAnnuelStats,
  filterAvPerSansVersementProgramme,
} from "@/lib/investissements/investissement-versements";
import {
  computeScpiReinvestissementCoverageStats,
  compareInvestissementsScpiCreditFirst,
  filterScpiSansReinvestissementDividendes,
  hasScpiCredit,
} from "@/lib/investissements/investissement-scpi-reinvest";
import {
  computePatrimoineStats,
  investissementMatchesSearch,
  matchesInvestissementTypeFilter,
  type PatrimoineOrigineFilter,
} from "@/lib/investissements/patrimoine-tab-utils";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";

type InvestissementsProps = {
  onOpenContact?: (contactId: number) => void;
};

function OrigineFilterPill({
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

export function Investissements({ onOpenContact }: InvestissementsProps) {
  const [investissements, setInvestissements] = useState<InvestissementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [origineFilter, setOrigineFilter] = useState<PatrimoineOrigineFilter>("all");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [partenaireFilter, setPartenaireFilter] = useState<string>("ALL");
  const [sansVpFilter, setSansVpFilter] = useState(false);
  const [sansReinvestFilter, setSansReinvestFilter] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [selectedInvestissement, setSelectedInvestissement] = useState<InvestissementWithDetails | null>(null);
  const [encoursInvestissement, setEncoursInvestissement] =
    useState<InvestissementWithDetails | null>(null);

  const loadInvestissements = useCallback(async () => {
    try {
      const data = await getInvestissementsWithDetails();
      setInvestissements(data);
    } catch (error) {
      console.error("Error loading investissements:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadInvestissements();
  }, [loadInvestissements]);

  useEventAutoRefresh(
    loadInvestissements,
    subscribeContactsChanged,
    subscribeFoyersChanged,
    subscribeInvestissementsChanged
  );

  const handleDelete = async (id: number) => {
    if (!confirm("Êtes-vous sûr de vouloir supprimer cet investissement ?")) {
      return;
    }

    try {
      await deleteInvestissement(id);
      await loadInvestissements();
    } catch (error) {
      console.error("Error deleting investissement:", error);
      alert("Erreur lors de la suppression: " + String(error));
    }
  };

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

  const avPerVpStats = useMemo(
    () => computeAvPerVersementProgrammeCoverageStats(investissements),
    [investissements]
  );

  const avPerVpPercentLabel =
    avPerVpStats.percentWithVp == null
      ? "—"
      : `${Math.round(avPerVpStats.percentWithVp)}\u00a0%`;

  const avPerVpDescription =
    avPerVpStats.total === 0
      ? "Aucun contrat AV/PER — avec moi"
      : sansVpFilter
        ? `${avPerVpStats.withoutVp} sans VP — filtre actif`
        : `${avPerVpStats.withVp}/${avPerVpStats.total} avec VP — AV & PER`;

  const scpiReinvestStats = useMemo(
    () => computeScpiReinvestissementCoverageStats(investissements),
    [investissements]
  );

  const scpiReinvestCreditCount = useMemo(() => {
    if (sansReinvestFilter) {
      return filterScpiSansReinvestissementDividendes(investissements).filter(hasScpiCredit)
        .length;
    }
    return scpiReinvestStats.withCredit;
  }, [investissements, sansReinvestFilter, scpiReinvestStats.withCredit]);

  const scpiReinvestPercentLabel =
    scpiReinvestStats.percentWithReinvest == null
      ? "—"
      : `${Math.round(scpiReinvestStats.percentWithReinvest)}\u00a0%`;

  const scpiCreditHint =
    scpiReinvestCreditCount > 0
      ? ` · ${scpiReinvestCreditCount} crédit${scpiReinvestCreditCount > 1 ? "s" : ""}`
      : "";

  const scpiReinvestDescription =
    scpiReinvestStats.total === 0
      ? "Aucune SCPI pleine propriété — avec moi"
      : sansReinvestFilter
        ? `${scpiReinvestStats.withoutReinvest} sans réinv.${scpiCreditHint} — filtre actif`
        : `${scpiReinvestStats.withReinvest}/${scpiReinvestStats.total} avec réinv.${scpiCreditHint} — SCPI`;

  const toggleSansVpFilter = () => {
    setSansReinvestFilter(false);
    setSansVpFilter((active) => {
      const next = !active;
      if (next) setTypeFilter("ALL");
      return next;
    });
  };

  const toggleSansReinvestFilter = () => {
    setSansVpFilter(false);
    setSansReinvestFilter((active) => {
      const next = !active;
      if (next) setTypeFilter("ALL");
      return next;
    });
  };

  const countByOrigine = useMemo(
    () => ({
      all: investissements.length,
      avec_moi: investissements.filter((i) => i.origine === "MON_CONSEIL").length,
      a_cote: investissements.filter((i) => i.origine !== "MON_CONSEIL").length,
    }),
    [investissements]
  );

  const filteredInvestissements = useMemo(() => {
    let list = investissements;

    if (sansReinvestFilter) {
      list = filterScpiSansReinvestissementDividendes(list);
    } else if (sansVpFilter) {
      list = filterAvPerSansVersementProgramme(list);
    } else if (origineFilter === "avec_moi") {
      list = list.filter((i) => i.origine === "MON_CONSEIL");
    } else if (origineFilter === "a_cote") {
      list = list.filter((i) => i.origine !== "MON_CONSEIL");
    }

    list = list.filter((inv) => {
      const matchesSearch = investissementMatchesSearch(searchQuery, inv);
      const matchesType =
        sansReinvestFilter || sansVpFilter
          ? true
          : matchesInvestissementTypeFilter(inv.type_produit, typeFilter);
      const matchesPartenaire =
        partenaireFilter === "ALL" || inv.partenaire_nom === partenaireFilter;
      return matchesSearch && matchesType && matchesPartenaire;
    });

    return list.sort((a, b) => {
      if (sansReinvestFilter) {
        const creditOrder = compareInvestissementsScpiCreditFirst(a, b);
        if (creditOrder !== 0) return creditOrder;
      }
      if (!a.date_souscription) return 1;
      if (!b.date_souscription) return -1;
      return b.date_souscription - a.date_souscription;
    });
  }, [investissements, origineFilter, searchQuery, typeFilter, partenaireFilter, sansVpFilter, sansReinvestFilter]);

  const filteredTotalCentimes = filteredInvestissements.reduce(
    (s, i) => s + (i.montant_initial ?? 0),
    0
  );

  const hasActiveFilters =
    origineFilter !== "all" ||
    searchQuery.trim() !== "" ||
    typeFilter !== "ALL" ||
    partenaireFilter !== "ALL" ||
    sansVpFilter ||
    sansReinvestFilter;

  const resetFilters = () => {
    setOrigineFilter("all");
    setSearchQuery("");
    setTypeFilter("ALL");
    setPartenaireFilter("ALL");
    setSansVpFilter(false);
    setSansReinvestFilter(false);
  };

  const handleExportCsv = () => {
    const headers = [
      "Produit",
      "Type",
      "Montant (€)",
      "Client prénom",
      "Client nom",
      "ID contact",
      "Foyer",
      "Partenaire",
      "Origine",
      "Date souscription",
      "Fin démembrement",
      "Notes",
    ];
    const rows = filteredInvestissements.map((inv) => [
      inv.nom_produit,
      inv.type_produit,
      ((inv.montant_initial ?? 0) / 100).toFixed(2),
      inv.contact_id ? inv.contact_prenom : "Commun",
      inv.contact_id ? inv.contact_nom : inv.foyer_nom ?? "",
      inv.contact_id ?? "",
      inv.foyer_nom ?? "",
      inv.partenaire_nom ?? "",
      inv.origine === "MON_CONSEIL" ? "Avec moi" : "À côté",
      inv.date_souscription ? formatCalendarDateFr(inv.date_souscription) : "",
      inv.date_fin_demembrement ? formatCalendarDateFr(inv.date_fin_demembrement) : "",
      inv.notes ?? "",
    ]);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsvFile(
      `investissements_${date}.csv`,
      rowsToCsv(headers, rows)
    );
    toast.success(`${filteredInvestissements.length} ligne(s) exportée(s)`);
  };

  const uniquePartenaires = Array.from(
    new Set(investissements.map((inv) => inv.partenaire_nom).filter(Boolean))
  ).sort();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Investissements
          </h2>
          <p className="text-muted-foreground">
            Vue portefeuille — tous les clients
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          {filteredInvestissements.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              Exporter CSV
            </Button>
          )}
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nouvel investissement
          </Button>
        </div>
      </div>

      <section className="space-y-2" aria-label="Synthèse du portefeuille">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Synthèse — clic sur une carte pour filtrer la liste
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
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
          <StatCard
            title="Couverture VP"
            value={avPerVpPercentLabel}
            description={avPerVpDescription}
            icon={Percent}
            accentColor="#059669"
            iconColor="text-emerald-600"
            iconBgColor="bg-emerald-50"
            highlight={sansVpFilter}
            onClick={
              avPerVpStats.total > 0 || sansVpFilter ? toggleSansVpFilter : undefined
            }
          />
          <StatCard
            title="Réinv. dividendes"
            value={scpiReinvestPercentLabel}
            description={scpiReinvestDescription}
            icon={RefreshCw}
            accentColor="#7C3AED"
            iconColor="text-violet-600"
            iconBgColor="bg-violet-50"
            highlight={sansReinvestFilter}
            onClick={
              scpiReinvestStats.total > 0 || sansReinvestFilter
                ? toggleSansReinvestFilter
                : undefined
            }
          />
        </div>
      </section>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <CardTitle>Liste des investissements</CardTitle>
                <CardDescription>
                  Cliquez sur une ligne (ou sur le nom du client) pour ouvrir la fiche
                  Contacts → onglet Patrimoine
                </CardDescription>
              </div>
              {!loading && investissements.length > 0 && (
                <p className="text-sm font-medium text-foreground tabular-nums shrink-0">
                  {filteredInvestissements.length} / {investissements.length}
                  <span className="text-muted-foreground font-normal ml-2">
                    {formatEuroCentimes(filteredTotalCentimes)}
                  </span>
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <OrigineFilterPill
                active={origineFilter === "all"}
                label="Tous"
                count={countByOrigine.all}
                onClick={() => setOrigineFilter("all")}
              />
              <OrigineFilterPill
                active={origineFilter === "avec_moi"}
                label="Avec moi"
                count={countByOrigine.avec_moi}
                onClick={() => setOrigineFilter("avec_moi")}
              />
              <OrigineFilterPill
                active={origineFilter === "a_cote"}
                label="À côté"
                count={countByOrigine.a_cote}
                onClick={() => setOrigineFilter("a_cote")}
              />
              {hasActiveFilters && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={resetFilters}
                >
                  Réinitialiser
                </Button>
              )}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par produit, client, partenaire..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger className="w-full sm:w-[200px]">
                  <Filter className="h-4 w-4 mr-2 shrink-0" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous les types</SelectItem>
                  <SelectItem value="SCPI">SCPI</SelectItem>
                  <SelectItem value="SCPI_DEMEMBREMENT">SCPI Démembrement</SelectItem>
                  <SelectItem value="ASSURANCE_VIE">Assurance Vie</SelectItem>
                  <SelectItem value="PER">PER</SelectItem>
                  <SelectItem value="IMMOBILIER">Immobilier</SelectItem>
                  <SelectItem value="FIP_FCPI">FIP/FCPI</SelectItem>
                  <SelectItem value="FCPR">FCPR / FPCI</SelectItem>
                  <SelectItem value="G3F">G3F</SelectItem>
                  <SelectItem value="AUTRE">Autre</SelectItem>
                </SelectContent>
              </Select>

              {uniquePartenaires.length > 0 && (
                <Select value={partenaireFilter} onValueChange={setPartenaireFilter}>
                  <SelectTrigger className="w-full sm:w-[200px]">
                    <Filter className="h-4 w-4 mr-2 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tous les partenaires</SelectItem>
                    {uniquePartenaires.map((partenaire) => (
                      <SelectItem key={partenaire} value={partenaire || ""}>
                        {partenaire}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : investissements.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Aucun investissement. Commencez par en créer un !
            </div>
          ) : filteredInvestissements.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                {sansReinvestFilter
                  ? "Aucune SCPI pleine propriété « avec moi » sans réinvestissement des dividendes."
                  : sansVpFilter
                    ? "Aucun contrat AV/PER « avec moi » sans versement programmé."
                    : "Aucun investissement pour ces filtres."}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                Tout afficher
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredInvestissements.map((inv) => {
                const ownerLabel = inv.foyer_nom
                  ? inv.foyer_nom
                  : [inv.contact_prenom, inv.contact_nom]
                      .filter(Boolean)
                      .join(" ")
                      .trim();
                const openContactPatrimoine = () => {
                  if (!onOpenContact) {
                    toast.error("Navigation vers la fiche contact indisponible");
                    return;
                  }
                  const contactId = inv.contact_id;
                  if (contactId == null || contactId <= 0) {
                    toast.error(
                      "Ce placement n’est pas lié à un contact — impossible d’ouvrir la fiche"
                    );
                    return;
                  }
                  onOpenContact(contactId);
                };

                return (
                  <InvestissementCard
                    key={inv.id}
                    inv={inv}
                    partenaireNom={inv.partenaire_nom}
                    proprietaireLabel={ownerLabel || undefined}
                    proprietaireVariant={inv.foyer_id ? "foyer" : "member"}
                    onOpenContactClick={
                      onOpenContact ? openContactPatrimoine : undefined
                    }
                    actions={
                      <>
                        {isPlacementEncoursEligible(inv.type_produit) && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-amber-700 hover:text-amber-800"
                            onClick={() => setEncoursInvestissement(inv)}
                            title="Mettre à jour l'encours"
                            aria-label="Encours"
                          >
                            <TrendingUp className="h-4 w-4" />
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedInvestissement(inv);
                            setShowForm(true);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleDelete(inv.id)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </>
                    }
                  />
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <InvestissementEncoursDialog
        open={encoursInvestissement != null}
        onOpenChange={(open) => {
          if (!open) setEncoursInvestissement(null);
        }}
        investissement={encoursInvestissement}
        onUpdated={loadInvestissements}
      />

      <InvestissementForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) {
            setSelectedInvestissement(null);
          }
        }}
        onSuccess={loadInvestissements}
        onEncoursUpdated={loadInvestissements}
        investissement={selectedInvestissement}
      />
    </div>
  );
}
