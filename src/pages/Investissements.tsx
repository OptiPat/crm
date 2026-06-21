import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { StatCard } from "@/components/dashboard/StatCard";
import {
  Plus,
  Search,
  TrendingUp,
  CalendarClock,
  Download,
  Percent,
  RefreshCw,
  X,
  Building2,
  FileUp,
} from "lucide-react";
import { rowsToCsv, downloadCsvFile } from "@/lib/export/csv-export";
import {
  getInvestissementsWithDetails,
  deleteInvestissement,
  type InvestissementWithDetails,
} from "@/lib/api/tauri-investissements";
import { getContactsByFoyer, type Contact } from "@/lib/api/tauri-contacts";
import { InvestissementForm } from "@/components/investissements/InvestissementForm";
import { InvestissementEncoursDialog } from "@/components/investissements/InvestissementEncoursDialog";
import { InvestissementCard } from "@/components/investissements/InvestissementCard";
import { InvestissementPatrimoineActions } from "@/components/investissements/InvestissementPatrimoineActions";
import { InvestissementCreateContactDialog } from "@/components/investissements/InvestissementCreateContactDialog";
import { InvestissementFoyerMemberPickerDialog } from "@/components/investissements/InvestissementFoyerMemberPickerDialog";
import { StelliumContratsImportDialog } from "@/components/investissements/StelliumContratsImportDialog";
import { VirtualizedInvestissementsPortfolio } from "@/components/investissements/VirtualizedInvestissementsPortfolio";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import {
  computeEncoursPlacementsStats,
  filterEncoursPlacementsAvecMoi,
  isPlacementEncoursEligible,
} from "@/lib/investissements/investissement-encours";
import {
  computeAvPerVersementProgrammeCoverageStats,
  computeVersementsProgrammesAnnuelStats,
  filterAvPerSansVersementProgramme,
} from "@/lib/investissements/investissement-versements";
import {
  computeScpiReinvestissementCoverageStats,
  filterScpiSansReinvestissementDividendes,
  hasScpiCredit,
} from "@/lib/investissements/investissement-scpi-reinvest";
import {
  computePatrimoineStats,
  investissementMatchesSearch,
  matchesAnyInvestissementTypeFilter,
  matchesOrigineFilters,
  type OrigineFilterChip,
} from "@/lib/investissements/patrimoine-tab-utils";
import {
  groupInvestissementsPortfolio,
  INVESTISSEMENT_PORTFOLIO_GROUP_LABELS,
  INVESTISSEMENT_PORTFOLIO_SORT_LABELS,
  sortInvestissementsPortfolio,
  sumMontantInitialCentimes,
  type InvestissementPortfolioGroup,
  type InvestissementPortfolioSort,
} from "@/lib/investissements/investissements-portfolio-utils";
import {
  filterSansEncoursRenseigneAvecMoi,
  resolvePortfolioGroupModeWhenFiltered,
} from "@/lib/investissements/investissements-portfolio-filters";
import {
  buildInvestissementActiveFilterChips,
  type InvestissementActiveFilterId,
} from "@/lib/investissements/investissements-active-filters";
import {
  loadInvestissementsPagePreferences,
  saveInvestissementsPagePreferences,
} from "@/lib/investissements/investissements-page-preferences";
import {
  INVESTISSEMENTS_CSV_HEADERS,
  investissementsToCsvRows,
} from "@/lib/investissements/investissements-portfolio-export";
import {
  InvestissementMultiFilterSelect,
  INVESTISSEMENT_TYPE_FILTER_OPTIONS,
} from "@/components/investissements/InvestissementMultiFilterSelect";
import { navigateAppPage } from "@/lib/navigation/app-navigation";
import { navigateToFoyers } from "@/lib/navigation/foyers-navigation";
import { navigateToPartenaires } from "@/lib/navigation/partenaires-navigation";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";

type InvestissementsProps = {
  onOpenContact?: (contactId: number) => void;
  onNavigate?: (page: string) => void;
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

export function Investissements({ onOpenContact, onNavigate }: InvestissementsProps) {
  const [investissements, setInvestissements] = useState<InvestissementWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [prefsLoaded, setPrefsLoaded] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [origineFilters, setOrigineFilters] = useState<OrigineFilterChip[]>([]);
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [partenaireFilters, setPartenaireFilters] = useState<string[]>([]);
  const [sansVpFilter, setSansVpFilter] = useState(false);
  const [sansReinvestFilter, setSansReinvestFilter] = useState(false);
  const [encoursPlacementsFilter, setEncoursPlacementsFilter] = useState(false);
  const [showCreatePicker, setShowCreatePicker] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [createContactId, setCreateContactId] = useState<number | undefined>();
  const [selectedInvestissement, setSelectedInvestissement] = useState<InvestissementWithDetails | null>(null);
  const [encoursInvestissement, setEncoursInvestissement] =
    useState<InvestissementWithDetails | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<InvestissementWithDetails | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [showStelliumImport, setShowStelliumImport] = useState(false);
  const [investissementsListVersion, setInvestissementsListVersion] = useState(0);
  const [foyerPicker, setFoyerPicker] = useState<{
    inv: InvestissementWithDetails;
    members: Contact[];
  } | null>(null);
  const [sortKey, setSortKey] = useState<InvestissementPortfolioSort>("client_asc");
  const [groupMode, setGroupMode] = useState<InvestissementPortfolioGroup>("category");

  useEffect(() => {
    const prefs = loadInvestissementsPagePreferences();
    setSortKey(prefs.sortKey);
    setGroupMode(prefs.groupMode);
    setOrigineFilters(prefs.origineFilters);
    setTypeFilters(prefs.typeFilters);
    setPartenaireFilters(prefs.partenaireFilters);
    setPrefsLoaded(true);
  }, []);

  useEffect(() => {
    if (!prefsLoaded) return;
    saveInvestissementsPagePreferences({
      sortKey,
      groupMode,
      origineFilters,
      typeFilters,
      partenaireFilters,
    });
  }, [
    prefsLoaded,
    sortKey,
    groupMode,
    origineFilters,
    typeFilters,
    partenaireFilters,
  ]);

  const loadInvestissements = useCallback(async () => {
    try {
      const data = await getInvestissementsWithDetails();
      setInvestissements(data);
      setInvestissementsListVersion((v) => v + 1);
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

  const goToDocuments = () => {
    if (onNavigate) {
      navigateAppPage("investissements", onNavigate, "documents");
    }
  };

  const goToContacts = () => {
    if (onNavigate) {
      navigateAppPage("investissements", onNavigate, "contacts");
    }
  };

  const openFoyerFromPicker = (foyerId: number) => {
    if (onNavigate) {
      navigateToFoyers(onNavigate, {
        foyerId,
        currentPage: "investissements",
      });
    }
  };

  const openPartenaireFromCard = (partenaireId: number, investissementId?: number) => {
    if (onNavigate) {
      navigateToPartenaires(onNavigate, {
        partenaireId,
        focusInvestissementId: investissementId,
        currentPage: "investissements",
      });
    }
  };

  const handleDelete = (inv: InvestissementWithDetails) => {
    setDeleteTarget(inv);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteInvestissement(deleteTarget.id);
      setDeleteTarget(null);
      await loadInvestissements();
      toast.success("Investissement supprimé");
    } catch (error) {
      console.error("Error deleting investissement:", error);
      toast.error("Erreur lors de la suppression : " + String(error));
    } finally {
      setDeleteBusy(false);
    }
  };

  const openInvestissementFromImport = useCallback(async (investissementId: number) => {
    try {
      const details = await getInvestissementsWithDetails();
      const inv = details.find((i) => i.id === investissementId);
      if (!inv) {
        toast.error("Investissement introuvable");
        return;
      }
      setSelectedInvestissement(inv);
      setShowForm(true);
    } catch {
      toast.error("Impossible de charger l'investissement");
    }
  }, []);

  const openInvestissementOwner = useCallback(
    async (inv: InvestissementWithDetails) => {
      if (!onOpenContact) {
        toast.error("Navigation vers la fiche contact indisponible");
        return;
      }
      if (inv.contact_id != null && inv.contact_id > 0) {
        onOpenContact(inv.contact_id);
        return;
      }
      if (inv.foyer_id != null && inv.foyer_id > 0) {
        try {
          const members = await getContactsByFoyer(inv.foyer_id);
          const valid = members.filter((m) => m.id != null && m.id > 0);
          if (valid.length === 0) {
            toast.error("Ce placement n'est lié à aucune fiche contact");
            return;
          }
          if (valid.length === 1) {
            onOpenContact(valid[0].id!);
            toast.info(
              `Placement commun au ${inv.foyer_nom?.trim() || "foyer"} — fiche ouverte sur le patrimoine`
            );
            return;
          }
          setFoyerPicker({ inv, members: valid });
        } catch (error) {
          console.error("Error loading foyer members:", error);
          toast.error("Impossible de charger les membres du foyer");
        }
        return;
      }
      toast.error("Ce placement n'est lié à aucune fiche contact");
    },
    [onOpenContact]
  );

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

  const sansEncoursCount = useMemo(
    () => filterSansEncoursRenseigneAvecMoi(investissements).length,
    [investissements]
  );

  const encoursAvecMoiCount = useMemo(
    () => filterEncoursPlacementsAvecMoi(investissements).length,
    [investissements]
  );

  const sansEncoursHint =
    sansEncoursCount > 0
      ? ` · ${sansEncoursCount} sans encours saisi`
      : "";

  const encoursCardDescription =
    encoursAvecMoiCount === 0
      ? "AV, PER, FIP/FCPI… — avec moi"
      : encoursPlacementsFilter
        ? `${encoursAvecMoiCount} support${encoursAvecMoiCount > 1 ? "s" : ""}${sansEncoursHint} — filtre actif`
        : `${encoursStats.count} support${encoursStats.count > 1 ? "s" : ""}${sansEncoursHint} — AV, PER, FIP/FCPI…`;

  const clearStatFilters = () => {
    setSansVpFilter(false);
    setSansReinvestFilter(false);
    setEncoursPlacementsFilter(false);
  };

  const toggleOrigineFilter = (chip: OrigineFilterChip) => {
    setOrigineFilters((prev) =>
      prev.includes(chip) ? prev.filter((x) => x !== chip) : [...prev, chip]
    );
  };

  const toggleSansVpFilter = () => {
    setSansReinvestFilter(false);
    setEncoursPlacementsFilter(false);
    setTypeFilters([]);
    setPartenaireFilters([]);
    setSansVpFilter((active) => !active);
  };

  const toggleSansReinvestFilter = () => {
    setSansVpFilter(false);
    setEncoursPlacementsFilter(false);
    setTypeFilters([]);
    setPartenaireFilters([]);
    setSansReinvestFilter((active) => !active);
  };

  const toggleEncoursPlacementsFilter = () => {
    setSansVpFilter(false);
    setSansReinvestFilter(false);
    setTypeFilters([]);
    setPartenaireFilters([]);
    setEncoursPlacementsFilter((active) => !active);
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
    } else if (encoursPlacementsFilter) {
      list = filterEncoursPlacementsAvecMoi(list);
    } else if (origineFilters.length > 0) {
      list = list.filter((i) => matchesOrigineFilters(i.origine, origineFilters));
    }

    list = list.filter((inv) => {
      const matchesSearch = investissementMatchesSearch(searchQuery, inv);
      const matchesType =
        sansReinvestFilter || sansVpFilter || encoursPlacementsFilter
          ? true
          : matchesAnyInvestissementTypeFilter(inv.type_produit, typeFilters);
      const matchesPartenaire =
        partenaireFilters.length === 0 ||
        (inv.partenaire_nom != null && partenaireFilters.includes(inv.partenaire_nom));
      return matchesSearch && matchesType && matchesPartenaire;
    });

    return sortInvestissementsPortfolio(
      list,
      encoursPlacementsFilter && sortKey === "date_desc" ? "encours_desc" : sortKey,
      {
      scpiCreditFirst: sansReinvestFilter,
      }
    );
  }, [
    investissements,
    origineFilters,
    searchQuery,
    typeFilters,
    partenaireFilters,
    sansVpFilter,
    sansReinvestFilter,
    encoursPlacementsFilter,
    sortKey,
  ]);

  const hasNarrowingFilters =
    sansVpFilter ||
    sansReinvestFilter ||
    encoursPlacementsFilter ||
    searchQuery.trim() !== "" ||
    typeFilters.length > 0 ||
    partenaireFilters.length > 0;

  const effectiveGroupMode = useMemo(
    () => resolvePortfolioGroupModeWhenFiltered(groupMode, hasNarrowingFilters),
    [groupMode, hasNarrowingFilters]
  );

  const filteredSouscritTotal = useMemo(
    () => sumMontantInitialCentimes(filteredInvestissements),
    [filteredInvestissements]
  );

  const filteredEncoursTotal = useMemo(
    () =>
      computeEncoursPlacementsStats(filteredInvestissements, { avecMoiOnly: false })
        .encoursCentimes,
    [filteredInvestissements]
  );

  const portfolioGroups = useMemo(
    () => groupInvestissementsPortfolio(filteredInvestissements, effectiveGroupMode),
    [filteredInvestissements, effectiveGroupMode]
  );

  const hasActiveFilters =
    origineFilters.length > 0 ||
    searchQuery.trim() !== "" ||
    typeFilters.length > 0 ||
    partenaireFilters.length > 0 ||
    sansVpFilter ||
    sansReinvestFilter ||
    encoursPlacementsFilter ||
    sortKey !== "date_desc" ||
    groupMode !== "category";

  const resetFilters = () => {
    setOrigineFilters([]);
    setSearchQuery("");
    setTypeFilters([]);
    setPartenaireFilters([]);
    clearStatFilters();
    setSortKey("date_desc");
    setGroupMode("category");
  };

  const activeFilterChips = useMemo(
    () =>
      buildInvestissementActiveFilterChips({
        sansVpFilter,
        sansReinvestFilter,
        encoursPlacementsFilter,
        origineFilters,
        searchQuery,
        typeFilters,
        partenaireFilters,
        sortKey,
        groupMode,
      }),
    [
      sansVpFilter,
      sansReinvestFilter,
      encoursPlacementsFilter,
      origineFilters,
      searchQuery,
      typeFilters,
      partenaireFilters,
      sortKey,
      groupMode,
    ]
  );

  const removeActiveFilter = (id: InvestissementActiveFilterId) => {
    switch (id) {
      case "sans_vp":
        setSansVpFilter(false);
        break;
      case "sans_reinvest":
        setSansReinvestFilter(false);
        break;
      case "encours_placements":
        setEncoursPlacementsFilter(false);
        break;
      case "origine_avec_moi":
        setOrigineFilters((prev) => prev.filter((x) => x !== "avec_moi"));
        break;
      case "origine_a_cote":
        setOrigineFilters((prev) => prev.filter((x) => x !== "a_cote"));
        break;
      case "search":
        setSearchQuery("");
        break;
      case "types":
        setTypeFilters([]);
        break;
      case "partenaires":
        setPartenaireFilters([]);
        break;
      case "sort":
        setSortKey("date_desc");
        break;
      case "group":
        setGroupMode("category");
        break;
      default:
        break;
    }
  };

  const renderInvestissementCard = (inv: InvestissementWithDetails) => {
    const ownerLabel = inv.foyer_nom
      ? inv.foyer_nom
      : [inv.contact_prenom, inv.contact_nom].filter(Boolean).join(" ").trim();

    return (
      <InvestissementCard
        key={inv.id}
        inv={inv}
        partenaireNom={inv.partenaire_nom}
        proprietaireLabel={ownerLabel || undefined}
        proprietaireVariant={inv.foyer_id ? "foyer" : "member"}
        onOpenContactClick={
          onOpenContact ? () => void openInvestissementOwner(inv) : undefined
        }
        onProprietaireClick={
          onOpenContact ? () => void openInvestissementOwner(inv) : undefined
        }
        onPartenaireClick={
          onNavigate && inv.partenaire_id != null
            ? () => openPartenaireFromCard(inv.partenaire_id!, inv.id)
            : undefined
        }
        actions={
          <InvestissementPatrimoineActions
            inv={inv}
            onEdit={(item) => {
              setSelectedInvestissement(item as InvestissementWithDetails);
              setShowForm(true);
            }}
            onDelete={(item) => handleDelete(item as InvestissementWithDetails)}
            onEncours={
              isPlacementEncoursEligible(inv.type_produit)
                ? (item) => setEncoursInvestissement(item as InvestissementWithDetails)
                : undefined
            }
          />
        }
      />
    );
  };

  const handleExportCsv = () => {
    const rows = investissementsToCsvRows(filteredInvestissements);
    const date = new Date().toISOString().slice(0, 10);
    downloadCsvFile(
      `investissements_${date}.csv`,
      rowsToCsv([...INVESTISSEMENTS_CSV_HEADERS], rows)
    );
    toast.success(`${filteredInvestissements.length} ligne(s) exportée(s)`);
  };

  const handleStartCreate = () => {
    setSelectedInvestissement(null);
    setCreateContactId(undefined);
    setShowCreatePicker(true);
  };

  const handleCreateContactPicked = (contactId: number) => {
    setCreateContactId(contactId);
    setShowForm(true);
  };

  const uniquePartenaires = useMemo(
    () =>
      Array.from(
        new Set(investissements.map((inv) => inv.partenaire_nom).filter(Boolean))
      ).sort() as string[],
    [investissements]
  );

  useEffect(() => {
    if (!prefsLoaded) return;
    setPartenaireFilters((prev) => {
      if (prev.length === 0) return prev;
      const valid = new Set(uniquePartenaires);
      const next = prev.filter((p) => valid.has(p));
      return next.length === prev.length ? prev : next;
    });
  }, [uniquePartenaires, prefsLoaded]);

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
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setShowStelliumImport(true)}
          >
            <FileUp className="h-4 w-4" />
            Import Stellium
          </Button>
          {filteredInvestissements.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={handleExportCsv}>
              <Download className="h-4 w-4" />
              Exporter CSV
            </Button>
          )}
          <Button className="gap-2" onClick={handleStartCreate}>
            <Plus className="h-4 w-4" />
            Nouvel investissement
          </Button>
        </div>
      </div>

      <section className="space-y-2" aria-label="Synthèse du portefeuille">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Synthèse — cliquer sur Couverture VP, Encours ou Réinv. dividendes pour filtrer la liste
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          <StatCard
            title="Avec moi"
            value={formatEuroCentimes(stats.avecMoiCentimes)}
            description={`${stats.countAvecMoi} support${stats.countAvecMoi > 1 ? "s" : ""} — montant souscrit`}
            icon={TrendingUp}
            accentColor="#dc216e"
            iconColor="text-rose-700"
            iconBgColor="bg-rose-50"
            highlight={
              origineFilters.includes("avec_moi") &&
              !sansVpFilter &&
              !sansReinvestFilter &&
              !encoursPlacementsFilter
            }
          />
          <StatCard
            title="Encours placements"
            value={formatEuroCentimes(encoursStats.encoursCentimes)}
            description={encoursCardDescription}
            icon={TrendingUp}
            accentColor="#C9A227"
            iconColor="text-amber-600"
            iconBgColor="bg-amber-50"
            highlight={encoursPlacementsFilter}
            onClick={
              encoursAvecMoiCount > 0 || encoursPlacementsFilter
                ? toggleEncoursPlacementsFilter
                : undefined
            }
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
                  Cliquez sur une ligne pour ouvrir la fiche du client (onglet Patrimoine).
                  Un placement au nom du couple permet de choisir le membre ou le foyer.
                </CardDescription>
              </div>
              {!loading && investissements.length > 0 && (
                <div className="text-sm font-medium text-foreground tabular-nums shrink-0 text-right">
                  <p>
                    {filteredInvestissements.length} / {investissements.length}
                  </p>
                  <p className="text-muted-foreground font-normal">
                    souscrit {formatEuroCentimes(filteredSouscritTotal)}
                  </p>
                  {filteredEncoursTotal > 0 && (
                    <p className="text-xs text-muted-foreground font-normal">
                      encours {formatEuroCentimes(filteredEncoursTotal)}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              <span className="text-xs text-muted-foreground self-center mr-1">Origine :</span>
              <OrigineFilterPill
                active={origineFilters.includes("avec_moi")}
                label="Avec moi"
                count={countByOrigine.avec_moi}
                onClick={() => toggleOrigineFilter("avec_moi")}
              />
              <OrigineFilterPill
                active={origineFilters.includes("a_cote")}
                label="À côté"
                count={countByOrigine.a_cote}
                onClick={() => toggleOrigineFilter("a_cote")}
              />
              {origineFilters.length > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setOrigineFilters([])}
                >
                  Toutes origines
                </Button>
              )}
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

              <InvestissementMultiFilterSelect
                label="Types"
                placeholder="Tous les types"
                options={INVESTISSEMENT_TYPE_FILTER_OPTIONS}
                value={typeFilters}
                onChange={setTypeFilters}
              />

              {uniquePartenaires.length > 0 && (
                <InvestissementMultiFilterSelect
                  label="Partenaires"
                  placeholder="Tous"
                  options={uniquePartenaires.map((p) => ({ value: p!, label: p! }))}
                  value={partenaireFilters}
                  onChange={setPartenaireFilters}
                />
              )}

              <Select
                value={sortKey}
                onValueChange={(v) => setSortKey(v as InvestissementPortfolioSort)}
              >
                <SelectTrigger className="w-full sm:w-[200px]" title="Ordre des lignes">
                  <SelectValue placeholder="Tri" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INVESTISSEMENT_PORTFOLIO_SORT_LABELS) as InvestissementPortfolioSort[]).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {INVESTISSEMENT_PORTFOLIO_SORT_LABELS[key]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>

              <Select
                value={groupMode}
                onValueChange={(v) => setGroupMode(v as InvestissementPortfolioGroup)}
              >
                <SelectTrigger className="w-full sm:w-[200px]" title="Sections dans la liste">
                  <SelectValue placeholder="Affichage" />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(INVESTISSEMENT_PORTFOLIO_GROUP_LABELS) as InvestissementPortfolioGroup[]).map(
                    (key) => (
                      <SelectItem key={key} value={key}>
                        {INVESTISSEMENT_PORTFOLIO_GROUP_LABELS[key]}
                      </SelectItem>
                    )
                  )}
                </SelectContent>
              </Select>
            </div>

            {activeFilterChips.length > 0 && (
              <div className="flex flex-wrap items-center gap-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm">
                <span className="text-muted-foreground shrink-0">Filtres actifs :</span>
                {activeFilterChips.map((chip) => (
                  <button
                    key={`${chip.id}-${chip.label}`}
                    type="button"
                    className="inline-flex items-center gap-1 rounded-full bg-background border px-2 py-0.5 text-xs font-medium hover:bg-muted/60 transition-colors"
                    onClick={() => removeActiveFilter(chip.id)}
                    aria-label={`Retirer le filtre ${chip.label}`}
                  >
                    {chip.label}
                    <X className="h-3 w-3 opacity-60" />
                  </button>
                ))}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs ml-auto gap-1"
                  onClick={resetFilters}
                >
                  <X className="h-3.5 w-3.5" />
                  Tout effacer
                </Button>
              </div>
            )}
            {hasNarrowingFilters && groupMode === "category" && (
              <p className="text-xs text-muted-foreground">
                Filtre actif — affichage en liste unique (choisissez « Par catégorie » dans Affichage
                pour retrouver Immobilier / Financier une fois les filtres levés).
              </p>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {filteredInvestissements.length > 0 && effectiveGroupMode === "category" && (
            <div className="flex flex-wrap items-center gap-3 text-[11px] text-muted-foreground">
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
              <span className="text-muted-foreground/80">
                Totaux de section : encours (AV, PER…) ou montant souscrit
              </span>
            </div>
          )}
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : investissements.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-muted/25 px-6 py-10 text-center">
              <Building2 className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
              <p className="text-sm font-medium">Aucun investissement enregistré</p>
              <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-md mx-auto">
                Importez un RIO ou relevé patrimonial pour préremplir les fiches, ou saisissez
                un placement manuellement après avoir choisi un client.
              </p>
              <div className="flex flex-wrap justify-center gap-2">
                {onNavigate && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1"
                    onClick={goToDocuments}
                  >
                    <FileUp className="h-4 w-4" />
                    Importer un document
                  </Button>
                )}
                <Button type="button" size="sm" className="gap-1" onClick={handleStartCreate}>
                  <Plus className="h-4 w-4" />
                  Ajouter un placement
                </Button>
              </div>
            </div>
          ) : filteredInvestissements.length === 0 ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-muted-foreground">
                {sansReinvestFilter
                  ? "Aucune SCPI pleine propriété « avec moi » sans réinvestissement des dividendes."
                  : sansVpFilter
                    ? "Aucun contrat AV/PER « avec moi » sans versement programmé."
                    : encoursPlacementsFilter
                      ? "Aucun contrat « avec moi » éligible encours (AV, PER, FIP/FCPI…)."
                      : "Aucun investissement pour ces filtres."}
              </p>
              <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                Tout afficher
              </Button>
            </div>
          ) : (
            <VirtualizedInvestissementsPortfolio
              groups={portfolioGroups}
              groupMode={effectiveGroupMode}
              itemCount={filteredInvestissements.length}
              renderCard={renderInvestissementCard}
            />
          )}
        </CardContent>
      </Card>

      <InvestissementCreateContactDialog
        open={showCreatePicker}
        onOpenChange={setShowCreatePicker}
        onConfirm={handleCreateContactPicked}
        onGoToContacts={onNavigate ? goToContacts : undefined}
      />

      <InvestissementFoyerMemberPickerDialog
        open={foyerPicker != null}
        onOpenChange={(open) => {
          if (!open) setFoyerPicker(null);
        }}
        foyerNom={foyerPicker?.inv.foyer_nom?.trim() || "Foyer commun"}
        members={foyerPicker?.members ?? []}
        onSelectContact={(contactId) => onOpenContact?.(contactId)}
        onOpenFoyer={
          foyerPicker?.inv.foyer_id && onNavigate
            ? () => openFoyerFromPicker(foyerPicker.inv.foyer_id!)
            : undefined
        }
      />

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
            setCreateContactId(undefined);
          }
        }}
        onSuccess={loadInvestissements}
        onEncoursUpdated={loadInvestissements}
        investissement={selectedInvestissement}
        defaultContactId={createContactId}
      />

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cet investissement ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  <span className="font-medium text-foreground">
                    {deleteTarget.nom_produit}
                  </span>
                  {deleteTarget.contact_nom && (
                    <>
                      {" "}
                      — {deleteTarget.contact_prenom} {deleteTarget.contact_nom}
                    </>
                  )}
                  {deleteTarget.foyer_nom && !deleteTarget.contact_nom && (
                    <> — {deleteTarget.foyer_nom}</>
                  )}
                  . Cette action est irréversible.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleteBusy}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={(e) => {
                e.preventDefault();
                void confirmDelete();
              }}
            >
              {deleteBusy ? "Suppression…" : "Supprimer"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <StelliumContratsImportDialog
        open={showStelliumImport}
        onOpenChange={setShowStelliumImport}
        onApplied={() => void loadInvestissements()}
        onOpenInvestissement={(id) => void openInvestissementFromImport(id)}
        investissementsVersion={investissementsListVersion}
      />
    </div>
  );
}
