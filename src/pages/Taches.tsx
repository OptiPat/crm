import { useCallback, useEffect, useMemo, useState } from "react";
import { Plus, ListTodo } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { TacheForm } from "@/components/taches/TacheForm";
import { PlanifierRdvDialog } from "@/components/calendar/PlanifierRdvDialog";
import {
  TachesActiveFilterChips,
  TachesAlertesBanner,
  TachesBulkBar,
  TachesEcheanceStatCards,
  TachesGroupedList,
  TachesPageHelp,
  TachesToolbar,
} from "@/components/taches/taches-page-ui";
import {
  getAllTaches,
  setTacheStatut,
  deleteTache,
  updateTache,
  type TacheWithContact,
} from "@/lib/api/tauri-taches";
import { getAlertesNonTraitees } from "@/lib/api/tauri-alertes";
import { subscribeTachesChanged } from "@/lib/taches/tache-events";
import { subscribeAlertesChanged } from "@/lib/alertes/alert-events";
import { requestOpenContact } from "@/lib/navigation/app-navigation";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import { consumeTachesNavigationIntent } from "@/lib/navigation/taches-navigation";
import {
  buildTachesActiveFilterChips,
  type TachesActiveFilterId,
} from "@/lib/taches/taches-active-filters";
import {
  countTachesByEcheanceStat,
  filterTachesList,
  groupTachesBySection,
  type TacheEcheanceStatFilter,
} from "@/lib/taches/tache-filters";
import { buildPostponedTachePayload } from "@/lib/taches/postpone-tache";
import {
  loadTachesPagePreferences,
  resetTachesPagePreferences,
  saveTachesPagePreferences,
  type TachesPagePreferences,
} from "@/lib/taches/taches-page-preferences";
import type { TachePriorite } from "@/lib/api/tauri-taches";
import { toast } from "sonner";

interface TachesProps {
  onNavigate?: (page: string) => void;
}

export function Taches({ onNavigate }: TachesProps) {
  const [prefs, setPrefs] = useState<TachesPagePreferences>(() =>
    loadTachesPagePreferences()
  );
  const [taches, setTaches] = useState<TacheWithContact[]>([]);
  const [alertesCount, setAlertesCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TacheWithContact | null>(null);
  const [rdvTache, setRdvTache] = useState<TacheWithContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TacheWithContact | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [bulkMode, setBulkMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  useEffect(() => {
    const navFilter = consumeTachesNavigationIntent();
    if (navFilter !== "urgent") return;
    setPrefs((prev) => {
      const next = {
        ...prev,
        statutFilter: "ACTIVES" as const,
        echeanceFilter: "urgent" as const,
      };
      saveTachesPagePreferences(next);
      return next;
    });
  }, []);

  const updatePrefs = useCallback((patch: Partial<TachesPagePreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveTachesPagePreferences(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    try {
      const [allTaches, alertes] = await Promise.all([
        getAllTaches(),
        getAlertesNonTraitees(),
      ]);
      setTaches(allTaches);
      setAlertesCount(alertes.length);
    } catch (error) {
      console.error("Erreur chargement tâches:", error);
      toast.error("Impossible de charger les tâches");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const unsubTaches = subscribeTachesChanged(() => void load());
    const unsubAlertes = subscribeAlertesChanged(() => void load());
    return () => {
      unsubTaches();
      unsubAlertes();
    };
  }, [load]);

  const echeanceCounts = useMemo(
    () => countTachesByEcheanceStat(taches),
    [taches]
  );

  const contactFilterOptions = useMemo(() => {
    const map = new Map<number, string>();
    for (const t of taches) {
      for (const c of t.contacts) {
        if (!map.has(c.contact_id)) {
          map.set(c.contact_id, `${c.prenom} ${c.nom}`.trim());
        }
      }
    }
    return [...map.entries()]
      .map(([id, label]) => ({ id, label }))
      .sort((a, b) => a.label.localeCompare(b.label, "fr"));
  }, [taches]);

  const contactLabel = useMemo(() => {
    if (prefs.contactIdFilter == null) return null;
    return contactFilterOptions.find((c) => c.id === prefs.contactIdFilter)?.label ?? null;
  }, [prefs.contactIdFilter, contactFilterOptions]);

  const filtered = useMemo(
    () =>
      filterTachesList({
        taches,
        statutFilter: prefs.statutFilter,
        echeanceFilter: prefs.echeanceFilter,
        searchQuery: prefs.searchQuery,
        prioriteFilter: prefs.prioriteFilter,
        contactIdFilter: prefs.contactIdFilter,
      }),
    [taches, prefs]
  );

  const sections = useMemo(
    () => groupTachesBySection(filtered),
    [filtered]
  );

  const activesCount = useMemo(
    () => taches.filter((t) => t.statut !== "FAIT").length,
    [taches]
  );

  const activeFilterChips = useMemo(
    () =>
      buildTachesActiveFilterChips({
        statutFilter: prefs.statutFilter,
        echeanceFilter: prefs.echeanceFilter,
        searchQuery: prefs.searchQuery,
        prioriteFilter: prefs.prioriteFilter,
        contactLabel,
      }),
    [prefs, contactLabel]
  );

  const handleToggle = async (tache: TacheWithContact) => {
    try {
      await setTacheStatut(tache.id, tache.statut === "FAIT" ? "A_FAIRE" : "FAIT");
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleteBusy(true);
    try {
      await deleteTache(deleteTarget.id);
      setDeleteTarget(null);
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    } finally {
      setDeleteBusy(false);
    }
  };

  const handlePostpone = async (tache: TacheWithContact, days: number) => {
    try {
      await updateTache(tache.id, buildPostponedTachePayload(tache, days));
      toast.success("Échéance reportée");
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const handleBulkMarkDone = async () => {
    if (selectedIds.size === 0) return;
    setBulkBusy(true);
    try {
      await Promise.all(
        [...selectedIds].map((id) => setTacheStatut(id, "FAIT"))
      );
      setSelectedIds(new Set());
      setBulkMode(false);
      toast.success("Tâches marquées comme faites");
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    } finally {
      setBulkBusy(false);
    }
  };

  const toggleBulkSelect = (tache: TacheWithContact) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(tache.id)) next.delete(tache.id);
      else next.add(tache.id);
      return next;
    });
  };

  const removeFilterChip = (id: TachesActiveFilterId) => {
    switch (id) {
      case "echeance":
        updatePrefs({ echeanceFilter: null });
        break;
      case "statut":
        updatePrefs({ statutFilter: "ACTIVES" });
        break;
      case "priorite":
        updatePrefs({ prioriteFilter: "all" });
        break;
      case "contact":
        updatePrefs({ contactIdFilter: null });
        break;
      case "search":
        updatePrefs({ searchQuery: "" });
        break;
    }
  };

  const resetFilters = () => {
    const defaults = resetTachesPagePreferences();
    setPrefs(defaults);
    saveTachesPagePreferences(defaults);
  };

  const openContact = (contactId: number) => {
    requestOpenContact(contactId, {
      currentPage: "taches",
      setCurrentPage: onNavigate,
    });
  };

  const toggleEcheanceFilter = (filter: TacheEcheanceStatFilter | null) => {
    updatePrefs({
      echeanceFilter: filter,
      statutFilter: filter ? "ACTIVES" : prefs.statutFilter,
    });
  };

  return (
    <div className="space-y-4 max-w-[1200px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-serif font-bold text-primary">
            <ListTodo className="h-6 w-6" />
            Tâches & rappels
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            To-do manuelles ({activesCount} à faire) — relances auto dans{" "}
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
          </p>
        </div>
        <Button
          type="button"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus className="h-4 w-4 mr-1" />
          Nouvelle tâche
        </Button>
      </div>

      <TachesPageHelp onNavigate={onNavigate} />

      <TachesAlertesBanner alertesCount={alertesCount} onNavigate={onNavigate} />

      <TachesEcheanceStatCards
        counts={echeanceCounts}
        activeFilter={
          prefs.echeanceFilter === "urgent" ? null : prefs.echeanceFilter
        }
        onFilterChange={toggleEcheanceFilter}
      />

      <TachesToolbar
        searchQuery={prefs.searchQuery}
        onSearchChange={(searchQuery) => updatePrefs({ searchQuery })}
        statutFilter={prefs.statutFilter}
        onStatutChange={(statutFilter) =>
          updatePrefs({
            statutFilter,
            echeanceFilter: statutFilter === "FAITES" ? null : prefs.echeanceFilter,
          })
        }
        prioriteFilter={prefs.prioriteFilter}
        onPrioriteChange={(prioriteFilter) =>
          updatePrefs({ prioriteFilter: prioriteFilter as TachePriorite | "all" })
        }
        contactFilterOptions={contactFilterOptions}
        contactIdFilter={prefs.contactIdFilter}
        onContactFilterChange={(contactIdFilter) => updatePrefs({ contactIdFilter })}
        bulkMode={bulkMode}
        onBulkModeChange={(next) => {
          setBulkMode(next);
          if (!next) setSelectedIds(new Set());
        }}
      />

      <TachesActiveFilterChips
        chips={activeFilterChips}
        onRemove={removeFilterChip}
        onReset={resetFilters}
      />

      <TachesBulkBar
        count={selectedIds.size}
        busy={bulkBusy}
        onMarkDone={() => void handleBulkMarkDone()}
        onClear={() => {
          setSelectedIds(new Set());
          setBulkMode(false);
        }}
      />

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <ListTodo className="mx-auto h-8 w-8 text-muted-foreground" />
          <p className="mt-2 text-sm text-muted-foreground">
            {prefs.statutFilter === "ACTIVES"
              ? "Aucune tâche à faire. Tout est à jour."
              : "Aucune tâche ne correspond aux filtres."}
          </p>
        </div>
      ) : (
        <TachesGroupedList
          sections={sections}
          showContact
          bulkMode={bulkMode}
          selectedIds={selectedIds}
          onToggleSelect={toggleBulkSelect}
          onToggle={(t) => void handleToggle(t)}
          onEdit={(t) => {
            setEditing(t);
            setFormOpen(true);
          }}
          onDelete={(t) => setDeleteTarget(t)}
          onOpenContact={openContact}
          onPlanifierRdv={(t) => setRdvTache(t)}
          onPostpone={(t, days) => void handlePostpone(t, days)}
          onAttachContact={(t) => {
            setEditing(t);
            setFormOpen(true);
          }}
        />
      )}

      <TacheForm
        open={formOpen}
        onOpenChange={setFormOpen}
        tache={editing}
        onSuccess={() => void load()}
      />

      <PlanifierRdvDialog
        open={!!rdvTache}
        onOpenChange={(o) => !o && setRdvTache(null)}
        contactId={rdvTache?.contacts[0]?.contact_id ?? 0}
        contactLabel={
          rdvTache?.contacts[0]
            ? `${rdvTache.contacts[0].prenom} ${rdvTache.contacts[0].nom}`.trim()
            : ""
        }
        tacheId={rdvTache?.id}
        defaultTitle={rdvTache ? `RDV — ${rdvTache.titre}` : undefined}
        onCreated={() => void load()}
      />

      <AlertDialog
        open={deleteTarget != null}
        onOpenChange={(open) => {
          if (!open && !deleteBusy) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette tâche ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget ? (
                <>
                  <strong>{deleteTarget.titre}</strong> sera définitivement supprimée.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteBusy}
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
    </div>
  );
}
