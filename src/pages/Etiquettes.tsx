import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Search,
  Tag,
  RefreshCw,
  Zap,
  Mail,
  Users,
  X,
} from "lucide-react";
import {
  getAllEtiquettesWithCount,
  getAllContactEtiquettesDetails,
  deleteEtiquette,
  seedDefaultEtiquettes,
  type EtiquetteWithCount,
} from "@/lib/api/tauri-etiquettes";
import { EtiquetteForm } from "@/components/etiquettes/EtiquetteForm";
import { EtiquetteCreateMenu } from "@/components/etiquettes/EtiquetteCreateMenu";
import { ExceltisEtiquetteCreateDialog } from "@/components/etiquettes/ExceltisEtiquetteCreateDialog";
import { EtiquetteContactsPanel } from "@/components/etiquettes/EtiquetteContactsPanel";
import { EtiquetteListCard } from "@/components/etiquettes/EtiquetteListCard";
import { SegmentsSection } from "@/components/etiquettes/SegmentsSection";
import { StatCard } from "@/components/dashboard/StatCard";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { getAllSegments } from "@/lib/api/tauri-segments";
import {
  buildSegmentLookup,
  type SegmentLookup,
} from "@/lib/etiquettes/etiquette-card-summary";
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
import { toast } from "sonner";
import { getConditionTypeLabel } from "@/lib/etiquettes/etiquette-condition-labels";
import {
  computeEtiquettesPageStats,
  countEtiquettesByFilter,
  filterEtiquettesByType,
  filterEtiquettesSearch,
  sortEtiquettesList,
  type EtiquettePageFilter,
  type EtiquetteSort,
} from "@/lib/etiquettes/etiquettes-page-utils";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";
import { countUniqueTaggedContacts } from "@/lib/etiquettes/etiquettes-unique-count";
import {
  notifyEtiquettesChanged,
  subscribeEtiquettesChanged,
} from "@/lib/etiquettes/etiquette-events";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { consumeEtiquetteEditFocus } from "@/lib/navigation/etiquettes-navigation";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";

const PAGE_FILTERS: { id: EtiquettePageFilter; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "auto", label: "Automatiques" },
  { id: "manual", label: "Manuelles" },
  { id: "email", label: "Campagne email" },
  { id: "inactive", label: "Désactivées" },
];

const SORT_OPTIONS: { id: EtiquetteSort; label: string }[] = [
  { id: "contacts", label: "Plus de contacts" },
  { id: "nom", label: "Nom (A→Z)" },
  { id: "priorite", label: "Priorité" },
  { id: "recent", label: "Plus récentes" },
];

function FilterPill({
  active,
  label,
  count,
  onClick,
}: {
  active: boolean;
  label: string;
  count: number;
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
      {count > 0 && (
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

export function Etiquettes({ onNavigate }: { onNavigate?: (page: string) => void }) {
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [etiquettes, setEtiquettes] = useState<EtiquetteWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageFilter, setPageFilter] = useState<EtiquettePageFilter>("all");
  const [sortBy, setSortBy] = useState<EtiquetteSort>("contacts");
  const [showForm, setShowForm] = useState(false);
  const [showExceltisForm, setShowExceltisForm] = useState(false);
  const [selectedEtiquette, setSelectedEtiquette] = useState<EtiquetteWithCount | null>(null);
  const [viewingContacts, setViewingContacts] = useState<EtiquetteWithCount | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [etiquetteToDelete, setEtiquetteToDelete] = useState<EtiquetteWithCount | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uniqueContactsTagged, setUniqueContactsTagged] = useState(0);
  const [pageTab, setPageTab] = useState<"etiquettes" | "segments">("etiquettes");
  const [segmentLookup, setSegmentLookup] = useState<SegmentLookup>(new Map());
  const [createIntent, setCreateIntent] = useState<"manual" | "auto" | "campaign" | null>(null);
  const [duplicateFrom, setDuplicateFrom] = useState<EtiquetteWithCount | null>(null);

  const sortEtiquettes = useCallback((data: EtiquetteWithCount[]) => {
    return [...data].sort((a, b) => {
      if (b.contact_count !== a.contact_count) return b.contact_count - a.contact_count;
      return b.priorite - a.priorite;
    });
  }, []);

  const refreshSegmentLookup = useCallback(async () => {
    try {
      const segments = await getAllSegments();
      setSegmentLookup(buildSegmentLookup(segments));
    } catch {
      /* segments optionnels pour l'affichage */
    }
  }, []);

  const refreshEtiquetteCounts = useCallback(async () => {
    try {
      const [data, details] = await Promise.all([
        sortEtiquettes(await getAllEtiquettesWithCount()),
        getAllContactEtiquettesDetails(),
      ]);
      setEtiquettes(data);
      setUniqueContactsTagged(countUniqueTaggedContacts(details));
      setViewingContacts((prev) => {
        if (!prev) return prev;
        return data.find((e) => e.id === prev.id) ?? prev;
      });
      await refreshSegmentLookup();
    } catch (error) {
      console.error("Error refreshing etiquette counts:", error);
    }
  }, [sortEtiquettes, refreshSegmentLookup]);

  const loadEtiquettes = useCallback(async () => {
    try {
      setLoading(true);
      let data = await getAllEtiquettesWithCount();

      if (data.length === 0) {
        const created = await seedDefaultEtiquettes();
        if (created > 0) {
          toast.success(`${created} étiquettes par défaut créées`);
          data = await getAllEtiquettesWithCount();
        }
      } else {
        const maintained = await seedDefaultEtiquettes();
        if (maintained > 0) {
          data = await getAllEtiquettesWithCount();
          if (maintained === 1) {
            toast.info("Doublon d'étiquette fusionné (réduction d'impôt)");
          }
        }
      }

      const sorted = sortEtiquettes(data);
      setEtiquettes(sorted);
      try {
        const details = await getAllContactEtiquettesDetails();
        setUniqueContactsTagged(countUniqueTaggedContacts(details));
      } catch {
        setUniqueContactsTagged(0);
      }
      await refreshSegmentLookup();
    } catch (error) {
      console.error("Error loading etiquettes:", error);
      toast.error("Erreur lors du chargement des étiquettes");
    } finally {
      setLoading(false);
    }
  }, [sortEtiquettes, refreshSegmentLookup]);

  const { openContactSheet: openEtiquetteContactSheet, sheet: contactDetailSheet } =
    useContactDetailSheet({
      onNavigate,
      onUpdate: () => void loadEtiquettes(),
    });

  useEffect(() => {
    void loadEtiquettes();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chargement initial unique au montage
  }, []);

  useEffect(() => {
    if (loading) return;
    const editId = consumeEtiquetteEditFocus();
    if (editId == null) return;
    const etiquette = etiquettes.find((e) => e.id === editId);
    if (!etiquette) return;
    setSelectedEtiquette(etiquette);
    setShowForm(true);
    setPageTab("etiquettes");
  }, [loading, etiquettes]);

  useEffect(() => {
    return subscribeEtiquettesChanged(() => {
      void refreshEtiquetteCounts();
    });
  }, [refreshEtiquetteCounts]);

  useEffect(() => {
    return subscribeContactsChanged(() => {
      void refreshEtiquetteCounts();
    });
  }, [refreshEtiquetteCounts]);

  const stats = useMemo(
    () => computeEtiquettesPageStats(etiquettes, uniqueContactsTagged),
    [etiquettes, uniqueContactsTagged]
  );
  const countByFilter = useMemo(() => countEtiquettesByFilter(etiquettes), [etiquettes]);

  const filteredEtiquettes = useMemo(() => {
    let list = filterEtiquettesByType(etiquettes, pageFilter);
    list = filterEtiquettesSearch(list, searchQuery, getConditionTypeLabel);
    return sortEtiquettesList(list, sortBy);
  }, [etiquettes, pageFilter, searchQuery, sortBy]);

  const hasActiveFilters =
    pageFilter !== "all" || searchQuery.trim() !== "";

  const resetFilters = () => {
    setPageFilter("all");
    setSearchQuery("");
  };

  const applyStatFilter = (filter: EtiquettePageFilter) => {
    setPageTab("etiquettes");
    setPageFilter(filter);
  };

  const handleEditEtiquette = (etiquette: EtiquetteWithCount) => {
    setDuplicateFrom(null);
    setSelectedEtiquette(etiquette);
    setShowForm(true);
  };

  const handleDuplicateEtiquette = (etiquette: EtiquetteWithCount) => {
    setSelectedEtiquette(null);
    setCreateIntent(null);
    setDuplicateFrom(etiquette);
    setShowForm(true);
  };

  const handleDeleteClick = (etiquette: EtiquetteWithCount) => {
    if (etiquette.is_default) {
      toast.error("Les étiquettes système ne peuvent pas être supprimées");
      return;
    }
    setEtiquetteToDelete(etiquette);
    setDeleteDialogOpen(true);
  };

  const handleConfirmDelete = async () => {
    if (!etiquetteToDelete) return;

    try {
      await deleteEtiquette(etiquetteToDelete.id);
      toast.success(`Étiquette « ${etiquetteToDelete.nom} » supprimée`);
      if (viewingContacts?.id === etiquetteToDelete.id) setViewingContacts(null);
      notifyEtiquettesChanged();
      await refreshEtiquetteCounts();
    } catch (error) {
      console.error("Error deleting etiquette:", error);
      const msg = error instanceof Error ? error.message : String(error);
      toast.error(msg.includes("défaut") ? msg : "Erreur lors de la suppression");
    } finally {
      setDeleteDialogOpen(false);
      setEtiquetteToDelete(null);
    }
  };

  const openClassicForm = () => {
    setCreateIntent(null);
    setSelectedEtiquette(null);
    setDuplicateFrom(null);
    setShowForm(true);
  };

  const openExceltisForm = () => {
    setShowExceltisForm(true);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedEtiquette(null);
    setDuplicateFrom(null);
    setCreateIntent(null);
  };

  const handleSync = async () => {
    setSyncing(true);
    try {
      const n = await runFullEtiquettesRecalc();
      await refreshEtiquetteCounts();
      toast.success(
        n > 0
          ? `${n} nouvelle${n > 1 ? "s" : ""} attribution${n > 1 ? "s" : ""}`
          : "Compteurs à jour"
      );
    } catch {
      toast.error("Erreur lors du recalcul");
    } finally {
      setSyncing(false);
    }
  };

  const listBlock = (
    <Card className="border-border/80 shadow-sm h-full flex flex-col min-h-0">
      <CardHeader className="pb-3 shrink-0">
        <CardTitle className="text-lg">Liste des étiquettes</CardTitle>
        <CardDescription>
          Cliquez sur une étiquette pour afficher ses contacts.
        </CardDescription>
        <div className="flex flex-wrap gap-2 pt-3">
          {PAGE_FILTERS.map((f) => (
            <FilterPill
              key={f.id}
              active={pageFilter === f.id}
              label={f.label}
              count={countByFilter[f.id]}
              onClick={() => setPageFilter(f.id)}
            />
          ))}
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
        <div className="pt-2">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, règle, description…"
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
                aria-label="Effacer"
              >
                <X className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
        {!loading && etiquettes.length > 0 && (
          <div className="flex items-center justify-between gap-2 pt-2">
            <p className="text-sm font-medium text-foreground tabular-nums">
              {filteredEtiquettes.length} / {etiquettes.length} étiquette
              {filteredEtiquettes.length > 1 ? "s" : ""}
            </p>
            <Select
              value={sortBy}
              onValueChange={(v) => setSortBy(v as EtiquetteSort)}
            >
              <SelectTrigger className="h-8 w-auto gap-1.5 text-xs" aria-label="Trier les étiquettes">
                <span className="text-muted-foreground">Trier&nbsp;:</span>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {SORT_OPTIONS.map((o) => (
                  <SelectItem key={o.id} value={o.id} className="text-xs">
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2",
              viewingContacts ? "lg:grid-cols-1 xl:grid-cols-2" : "lg:grid-cols-3"
            )}
            aria-busy="true"
          >
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className="h-[120px] rounded-xl border border-border/60 bg-muted/40 animate-pulse"
              />
            ))}
          </div>
        ) : filteredEtiquettes.length === 0 ? (
          <div className="text-center py-10 px-4">
            <Tag className="h-10 w-10 mx-auto text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium">
              {hasActiveFilters ? "Aucune étiquette pour ces filtres" : "Aucune étiquette"}
            </p>
            {hasActiveFilters ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={resetFilters}
              >
                Tout afficher
              </Button>
            ) : (
              <EtiquetteCreateMenu
                size="sm"
                className="mt-3"
                onClassic={openClassicForm}
                onExceltis={openExceltisForm}
              />
            )}
          </div>
        ) : (
          <div
            className={cn(
              "grid gap-3 sm:grid-cols-2",
              viewingContacts ? "lg:grid-cols-1 xl:grid-cols-2" : "lg:grid-cols-3"
            )}
          >
            {filteredEtiquettes.map((etiquette) => (
              <EtiquetteListCard
                key={etiquette.id}
                etiquette={etiquette}
                segments={segmentLookup}
                selected={viewingContacts?.id === etiquette.id}
                onSelect={() => setViewingContacts(etiquette)}
                onEdit={() => handleEditEtiquette(etiquette)}
                onDuplicate={() => handleDuplicateEtiquette(etiquette)}
                onDelete={() => handleDeleteClick(etiquette)}
              />
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );

  const contactsPanel = viewingContacts ? (
    <EtiquetteContactsPanel
      etiquette={viewingContacts}
      onClose={() => setViewingContacts(null)}
      onOpenContact={openEtiquetteContactSheet}
      onContactsChanged={loadEtiquettes}
      className={cn("min-h-[320px]", isWide && "h-full lg:min-h-0")}
    />
  ) : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">Étiquettes</h2>
          <p className="text-muted-foreground max-w-2xl">
            Règles automatiques, tags manuels et campagnes email. Les attributions se
            mettent à jour à chaque modification ; recalcul complet après import massif.
          </p>
          <p className="text-sm text-foreground/85 border-l-2 border-primary/35 pl-3 mt-3 max-w-2xl leading-snug">
            <span className="font-medium">Groupe de contacts</span> = liste filtrée réutilisable
            {" · "}
            <span className="font-medium">Étiquette</span> = badge sur la fiche (+ email optionnel)
          </p>
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void handleSync()}
            disabled={syncing}
            title="Après import massif ou si les compteurs semblent incohérents"
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            Recalculer les règles
          </Button>
          <EtiquetteCreateMenu onClassic={openClassicForm} onExceltis={openExceltisForm} />
        </div>
      </div>

      <Tabs
        value={pageTab}
        onValueChange={(v) => setPageTab(v as "etiquettes" | "segments")}
        className="space-y-4"
      >
        <TabsList>
          <TabsTrigger value="etiquettes">Étiquettes</TabsTrigger>
          <TabsTrigger value="segments">Groupes de contacts</TabsTrigger>
        </TabsList>

        <TabsContent value="etiquettes" className="mt-0 space-y-6">
      <section className="space-y-2" aria-label="Synthèse des étiquettes">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Synthèse — cliquer pour filtrer
        </p>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            title="Contacts tagués"
            value={stats.contactsTagged}
            description={`${stats.totalEtiquettes} étiquette${stats.totalEtiquettes > 1 ? "s" : ""} — ${stats.activeCount} active${stats.activeCount > 1 ? "s" : ""}`}
            icon={Users}
            accentColor="#1e3a5f"
            iconColor="text-slate-700"
            iconBgColor="bg-slate-50"
            onClick={() => applyStatFilter("all")}
            highlight={pageFilter === "all" && pageTab === "etiquettes"}
          />
          <StatCard
            title="Règles auto"
            value={stats.autoCount}
            description="Attribution selon délai, dates, produits…"
            icon={Zap}
            accentColor="#d97706"
            iconColor="text-amber-700"
            iconBgColor="bg-amber-50"
            onClick={() => applyStatFilter("auto")}
            highlight={pageFilter === "auto"}
          />
          <StatCard
            title="Manuelles"
            value={stats.manualCount}
            description="Posées à la main sur la fiche contact"
            icon={Tag}
            accentColor="#6b7280"
            iconColor="text-gray-600"
            iconBgColor="bg-gray-50"
            onClick={() => applyStatFilter("manual")}
            highlight={pageFilter === "manual"}
          />
          <StatCard
            title="Campagnes email"
            value={stats.emailCount}
            description="Étiquettes avec envoi planifié"
            icon={Mail}
            accentColor="#2563eb"
            iconColor="text-blue-700"
            iconBgColor="bg-blue-50"
            onClick={() => applyStatFilter("email")}
            highlight={pageFilter === "email"}
          />
        </div>
      </section>

      {viewingContacts ? (
        <div
          className={cn(
            "grid gap-4",
            isWide && "lg:grid-cols-12 lg:min-h-[min(70vh,640px)]"
          )}
        >
          <div className={cn(isWide && "lg:col-span-6 xl:col-span-7 min-h-0")}>
            {listBlock}
          </div>
          <div className={cn(isWide && "lg:col-span-6 xl:col-span-5 min-h-0")}>
            {contactsPanel}
          </div>
        </div>
      ) : (
        listBlock
      )}
        </TabsContent>

        <TabsContent value="segments" className="mt-0">
          <SegmentsSection etiquettes={etiquettes} />
        </TabsContent>
      </Tabs>

      <EtiquetteForm
        open={showForm}
        onOpenChange={handleFormClose}
        etiquette={selectedEtiquette}
        duplicateFrom={duplicateFrom}
        createIntent={createIntent}
        onSuccess={loadEtiquettes}
        onSegmentsChanged={refreshSegmentLookup}
        onOpenSegmentsTab={() => {
          handleFormClose();
          setPageTab("segments");
        }}
      />

      <ExceltisEtiquetteCreateDialog
        open={showExceltisForm}
        onOpenChange={setShowExceltisForm}
        onSuccess={loadEtiquettes}
      />

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette étiquette ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;étiquette « {etiquetteToDelete?.nom} » sera supprimée définitivement.
              {etiquetteToDelete && etiquetteToDelete.contact_count > 0 && (
                <span className="block mt-2 text-destructive">
                  Attention : {etiquetteToDelete.contact_count} contact
                  {etiquetteToDelete.contact_count > 1 ? "s" : ""} perdront cette étiquette.
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {contactDetailSheet}
    </div>
  );
}
