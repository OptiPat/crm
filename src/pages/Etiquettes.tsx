import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Plus,
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
import { EtiquetteContactsPanel } from "@/components/etiquettes/EtiquetteContactsPanel";
import { EtiquetteListCard } from "@/components/etiquettes/EtiquetteListCard";
import { StatCard } from "@/components/dashboard/StatCard";
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
  type EtiquettePageFilter,
} from "@/lib/etiquettes/etiquettes-page-utils";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";
import { countUniqueTaggedContacts } from "@/lib/etiquettes/etiquettes-unique-count";
import {
  notifyEtiquettesChanged,
  subscribeEtiquettesChanged,
} from "@/lib/etiquettes/etiquette-events";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";

const PAGE_FILTERS: { id: EtiquettePageFilter; label: string }[] = [
  { id: "all", label: "Toutes" },
  { id: "auto", label: "Automatiques" },
  { id: "manual", label: "Manuelles" },
  { id: "email", label: "Campagne email" },
  { id: "inactive", label: "Désactivées" },
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

interface EtiquettesProps {
  onOpenContact?: (contactId: number) => void;
}

export function Etiquettes({ onOpenContact }: EtiquettesProps) {
  const isWide = useMediaQuery("(min-width: 1024px)");
  const [etiquettes, setEtiquettes] = useState<EtiquetteWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [pageFilter, setPageFilter] = useState<EtiquettePageFilter>("all");
  const [showForm, setShowForm] = useState(false);
  const [selectedEtiquette, setSelectedEtiquette] = useState<EtiquetteWithCount | null>(null);
  const [viewingContacts, setViewingContacts] = useState<EtiquetteWithCount | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [etiquetteToDelete, setEtiquetteToDelete] = useState<EtiquetteWithCount | null>(null);
  const [syncing, setSyncing] = useState(false);
  const [uniqueContactsTagged, setUniqueContactsTagged] = useState(0);

  const sortEtiquettes = useCallback((data: EtiquetteWithCount[]) => {
    return [...data].sort((a, b) => {
      if (b.contact_count !== a.contact_count) return b.contact_count - a.contact_count;
      return b.priorite - a.priorite;
    });
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
    } catch (error) {
      console.error("Error refreshing etiquette counts:", error);
    }
  }, [sortEtiquettes]);

  const loadEtiquettes = async () => {
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
    } catch (error) {
      console.error("Error loading etiquettes:", error);
      toast.error("Erreur lors du chargement des étiquettes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEtiquettes();
  }, []);

  useEffect(() => {
    return subscribeEtiquettesChanged(() => {
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
    return list;
  }, [etiquettes, pageFilter, searchQuery]);

  const hasActiveFilters =
    pageFilter !== "all" || searchQuery.trim() !== "";

  const resetFilters = () => {
    setPageFilter("all");
    setSearchQuery("");
  };

  const handleEditEtiquette = (etiquette: EtiquetteWithCount) => {
    setSelectedEtiquette(etiquette);
    setShowForm(true);
  };

  const handleDeleteClick = (etiquette: EtiquetteWithCount) => {
    if (etiquette.is_default) {
      toast.error("Les étiquettes par défaut ne peuvent pas être supprimées");
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

  const handleFormClose = () => {
    setShowForm(false);
    setSelectedEtiquette(null);
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

  const openContactFromEtiquette = (contactId: number, label: string) => {
    if (!onOpenContact) {
      toast.error("Navigation vers la fiche contact indisponible");
      return;
    }
    onOpenContact(contactId);
    toast.success(`Ouverture de ${label}`);
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
        <div className="relative pt-2">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground mt-1" />
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
              className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7 mt-0.5"
              onClick={() => setSearchQuery("")}
              aria-label="Effacer"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
        {!loading && etiquettes.length > 0 && (
          <p className="text-sm font-medium text-foreground pt-2 tabular-nums">
            {filteredEtiquettes.length} / {etiquettes.length} étiquette
            {filteredEtiquettes.length > 1 ? "s" : ""}
          </p>
        )}
      </CardHeader>
      <CardContent className="flex-1 min-h-0 overflow-y-auto">
        {loading ? (
          <p className="text-center py-8 text-muted-foreground text-sm">
            Chargement…
          </p>
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
              <Button type="button" size="sm" className="mt-3 gap-1" onClick={() => setShowForm(true)}>
                <Plus className="h-4 w-4" />
                Créer une étiquette
              </Button>
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
                selected={viewingContacts?.id === etiquette.id}
                onSelect={() => setViewingContacts(etiquette)}
                onEdit={() => handleEditEtiquette(etiquette)}
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
      onOpenContact={
        onOpenContact
          ? (contactId, label) => openContactFromEtiquette(contactId, label)
          : undefined
      }
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
        </div>
        <div className="flex flex-wrap gap-2 shrink-0">
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => void handleSync()}
            disabled={syncing}
          >
            <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            Recalculer les règles
          </Button>
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nouvelle étiquette
          </Button>
        </div>
      </div>

      <section className="space-y-2" aria-label="Synthèse des étiquettes">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          Synthèse — clic pour filtrer la liste
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
          />
          <StatCard
            title="Règles auto"
            value={stats.autoCount}
            description="Attribution selon délai, dates, produits…"
            icon={Zap}
            accentColor="#d97706"
            iconColor="text-amber-700"
            iconBgColor="bg-amber-50"
            highlight={pageFilter === "auto"}
            onClick={() =>
              setPageFilter((f) => (f === "auto" ? "all" : "auto"))
            }
          />
          <StatCard
            title="Manuelles"
            value={stats.manualCount}
            description="Posées à la main sur la fiche contact"
            icon={Tag}
            accentColor="#6b7280"
            iconColor="text-gray-600"
            iconBgColor="bg-gray-50"
            highlight={pageFilter === "manual"}
            onClick={() =>
              setPageFilter((f) => (f === "manual" ? "all" : "manual"))
            }
          />
          <StatCard
            title="Campagnes email"
            value={stats.emailCount}
            description="Étiquettes avec envoi planifié"
            icon={Mail}
            accentColor="#2563eb"
            iconColor="text-blue-700"
            iconBgColor="bg-blue-50"
            highlight={pageFilter === "email"}
            onClick={() =>
              setPageFilter((f) => (f === "email" ? "all" : "email"))
            }
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

      <EtiquetteForm
        open={showForm}
        onOpenChange={handleFormClose}
        etiquette={selectedEtiquette}
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
    </div>
  );
}
