import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Check } from "lucide-react";
import { SuiviAlerteCard } from "@/components/suivi/SuiviAlerteCard";
import {
  SuiviAlertesBulkBar,
  SuiviAlertesHelp,
  SuiviAlertesSectionHeader,
  SuiviAlertesSummaryBanner,
  SuiviAlertesToolbar,
  SuiviAlertesTraiterDateShortcuts,
  SuiviAlertesUrgencyStatCards,
} from "@/components/suivi/suivi-alertes-ui";
import { PlanifierRdvDialog } from "@/components/calendar/PlanifierRdvDialog";
import { TacheForm } from "@/components/taches/TacheForm";
import { EtiquetteEmailSendDialog } from "@/components/etiquettes/EtiquetteEmailSendDialog";
import {
  marquerAlerteTraitee,
  deleteAlerte,
  snoozeAlerte,
  formatAlerteContactLabel,
} from "@/lib/api/tauri-alertes";
import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";
import { getTypeAlerteLabel } from "@/lib/alertes/alerte-labels";
import { countAlertesByCategory, type AlerteCategoryFilter } from "@/lib/alertes/alerte-category";
import {
  buildContactIdsWithActiveTaches,
  countAlertesByUrgency,
  countAlertesWithEmailCampaign,
  filterAlertes,
  findNextAlerteInList,
  groupAlertesBySection,
  sortAlertes,
} from "@/lib/alertes/alerte-filters";
import type {
  AlerteSortMode,
  AlerteViewMode,
} from "@/lib/alertes/alerte-filters";
import {
  buildSuiviAlertesActiveFilterChips,
  type SuiviAlertesActiveFilterId,
} from "@/lib/alertes/suivi-alertes-active-filters";
import {
  loadSuiviAlertesPreferences,
  saveSuiviAlertesPreferences,
  type SuiviAlertesPreferences,
} from "@/lib/alertes/suivi-alertes-preferences";
import {
  alerteHasActiveEmailCampaign,
  resolveAlerteEmailAction,
} from "@/lib/alertes/alerte-email-queue";
import { suiviAlerteToRef } from "@/lib/suivi/suivi-alerte-ref";
import { getContactById, updateContact } from "@/lib/api/tauri-contacts";
import type { DashboardDrillDownOpenContact } from "@/lib/dashboard/dashboard-drill-down";
import { getAllTaches } from "@/lib/api/tauri-taches";
import {
  addMonthsLocal,
  contactToUpdatePayload,
  isAlerteSuiviFilleul,
  suiviDatesOverrides,
  todayLocal,
} from "@/lib/contacts/contact-form-utils";
import { buildTacheDraftFromAlerte } from "@/lib/taches/tache-from-alerte";
import type { EtiquetteEmailQueueItem, EtiquetteWithCount } from "@/lib/api/tauri-etiquettes";
import { isEtiquetteQueueItemBatchLocked } from "@/lib/etiquettes/etiquette-email-send-runner";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { subscribeTachesChanged } from "@/lib/taches/tache-events";
import { toast } from "sonner";

export type SuiviAlertesTabProps = {
  alertes: AlerteWithContact[];
  loading: boolean;
  etiquettes: EtiquetteWithCount[];
  loadingEtiquettes: boolean;
  totalContactsAvecEtiquettes: number;
  treatedThisWeek: number;
  onNavigate?: (page: string) => void;
  onOpenContact?: DashboardDrillDownOpenContact;
  onOpenHistorique?: (contactId: number) => void;
  onOpenEtiquettesTab: () => void;
  onOpenEnvoisTab: () => void;
  onAlertesChange: React.Dispatch<React.SetStateAction<AlerteWithContact[]>>;
  onRefreshAlertes: () => Promise<void>;
  onRefreshEmailCount: () => Promise<void>;
  pendingContactId: number | null;
  onPendingContactConsumed: () => void;
};

function persistPrefs(partial: Partial<SuiviAlertesPreferences>, current: SuiviAlertesPreferences) {
  const next = { ...current, ...partial };
  saveSuiviAlertesPreferences(next);
  return next;
}

export function SuiviAlertesTab({
  alertes,
  loading,
  etiquettes,
  loadingEtiquettes,
  totalContactsAvecEtiquettes,
  treatedThisWeek,
  onNavigate,
  onOpenContact,
  onOpenHistorique,
  onOpenEtiquettesTab,
  onOpenEnvoisTab,
  onAlertesChange,
  onRefreshAlertes,
  onRefreshEmailCount,
  pendingContactId,
  onPendingContactConsumed,
}: SuiviAlertesTabProps) {
  const [prefs, setPrefs] = useState(loadSuiviAlertesPreferences);
  const [alerteATraiter, setAlerteATraiter] = useState<AlerteWithContact | null>(null);
  const [dateDernierSuivi, setDateDernierSuivi] = useState(todayLocal());
  const [submittingTraiter, setSubmittingTraiter] = useState(false);
  const [alertEmailItem, setAlertEmailItem] = useState<EtiquetteEmailQueueItem | null>(null);
  const [alertEmailLoadingId, setAlertEmailLoadingId] = useState<number | null>(null);
  const [rdvAlerte, setRdvAlerte] = useState<AlerteWithContact | null>(null);
  const [tacheFromAlerte, setTacheFromAlerte] = useState<AlerteWithContact | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AlerteWithContact | null>(null);
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [contactIdsWithTache, setContactIdsWithTache] = useState<Set<number>>(new Set());

  const updatePrefs = useCallback((partial: Partial<SuiviAlertesPreferences>) => {
    setPrefs((prev) => persistPrefs(partial, prev));
  }, []);

  const alerteCategoryCounts = useMemo(
    () => countAlertesByCategory(alertes),
    [alertes]
  );
  const urgencyCounts = useMemo(() => countAlertesByUrgency(alertes), [alertes]);
  const emailCampaignCount = useMemo(
    () => countAlertesWithEmailCampaign(alertes, etiquettes),
    [alertes, etiquettes]
  );

  const alertesFiltered = useMemo(() => {
    const filtered = filterAlertes(alertes, {
      categoryFilter: prefs.categoryFilter,
      urgencyFilter: prefs.urgencyFilter,
      searchQuery: prefs.searchQuery,
    });
    return sortAlertes(filtered, prefs.sortMode);
  }, [alertes, prefs]);

  const alerteSections = useMemo(
    () => groupAlertesBySection(alertesFiltered),
    [alertesFiltered]
  );

  const activeFilterChips = useMemo(
    () =>
      buildSuiviAlertesActiveFilterChips({
        categoryFilter: prefs.categoryFilter,
        urgencyFilter: prefs.urgencyFilter,
        searchQuery: prefs.searchQuery,
      }),
    [prefs]
  );

  const alerteContactIds = useMemo(
    () => alertesFiltered.map((a) => a.contact_id),
    [alertesFiltered]
  );

  const openAlerteContact = useCallback(
    (contactId: number) => {
      onOpenContact?.(contactId, alerteContactIds);
    },
    [onOpenContact, alerteContactIds]
  );

  const loadTachesForIndicator = useCallback(async () => {
    try {
      const taches = await getAllTaches();
      setContactIdsWithTache(buildContactIdsWithActiveTaches(taches));
    } catch {
      setContactIdsWithTache(new Set());
    }
  }, []);

  useEffect(() => {
    void loadTachesForIndicator();
    return subscribeTachesChanged(() => void loadTachesForIndicator());
  }, [loadTachesForIndicator]);

  useEffect(() => {
    if (pendingContactId == null || loading) return;
    const alerte = alertes.find((a) => a.contact_id === pendingContactId);
    if (alerte) {
      setAlerteATraiter(alerte);
      setDateDernierSuivi(todayLocal());
    } else if (onOpenContact) {
      onOpenContact(pendingContactId);
    } else if (onNavigate) {
      sessionStorage.setItem("crm_open_contact_id", String(pendingContactId));
      onNavigate("contacts");
    }
    onPendingContactConsumed();
  }, [
    pendingContactId,
    loading,
    alertes,
    onOpenContact,
    onNavigate,
    onPendingContactConsumed,
  ]);

  const openTraiterDialog = (alerte: AlerteWithContact) => {
    setAlerteATraiter(alerte);
    setDateDernierSuivi(todayLocal());
  };

  const confirmTraiter = async (andNext = false) => {
    if (!alerteATraiter) return;
    setSubmittingTraiter(true);
    try {
      const contact = await getContactById(alerteATraiter.contact_id);
      await updateContact(
        alerteATraiter.contact_id,
        contactToUpdatePayload(
          contact,
          suiviDatesOverrides(alerteATraiter.type_alerte, {
            dernierContact: dateDernierSuivi,
          })
        )
      );
      await marquerAlerteTraitee(alerteATraiter.alerte_id);
      const treatedId = alerteATraiter.alerte_id;
      const next = andNext ? findNextAlerteInList(alertesFiltered, treatedId) : null;
      onAlertesChange((prev) => prev.filter((a) => a.alerte_id !== treatedId));
      setAlerteATraiter(null);
      toast.success("Suivi enregistré sur le contact");
      notifyRelationChanged(alerteATraiter.contact_id);
      if (next) {
        openTraiterDialog(next);
      }
    } catch (error) {
      console.error("Error marking alerte as treated:", error);
      toast.error("Erreur lors du traitement");
    } finally {
      setSubmittingTraiter(false);
    }
  };

  const handleReporterSuivi = async (alerte: AlerteWithContact, mois: number) => {
    try {
      const contact = await getContactById(alerte.contact_id);
      await updateContact(
        alerte.contact_id,
        contactToUpdatePayload(
          contact,
          suiviDatesOverrides(alerte.type_alerte, {
            dernierContact: todayLocal(),
            prochainSuivi: addMonthsLocal(mois),
          })
        )
      );
      await marquerAlerteTraitee(alerte.alerte_id);
      onAlertesChange((prev) => prev.filter((a) => a.alerte_id !== alerte.alerte_id));
      toast.success(`Suivi reporté de ${mois} mois`);
      notifyRelationChanged(alerte.contact_id);
    } catch (error) {
      console.error("Error reporting suivi:", error);
      toast.error("Erreur lors du report du suivi");
    }
  };

  const handleSnooze = async (alerte: AlerteWithContact, days: number) => {
    try {
      await snoozeAlerte(alerte.alerte_id, days);
      onAlertesChange((prev) => prev.filter((a) => a.alerte_id !== alerte.alerte_id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(alerte.alerte_id);
        return next;
      });
      toast.success(`Alerte masquée ${days} jours`);
    } catch (error) {
      console.error("Error snoozing alerte:", error);
      toast.error("Erreur lors du snooze");
    }
  };

  const handleSupprimer = async (id: number) => {
    try {
      await deleteAlerte(id);
      onAlertesChange((prev) => prev.filter((a) => a.alerte_id !== id));
      setSelectedIds((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      toast.success("Alerte supprimée");
    } catch (error) {
      console.error("Error deleting alerte:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleEnvoyerEmailDepuisAlerte = async (alerte: AlerteWithContact) => {
    if (loadingEtiquettes) {
      toast.info("Chargement des étiquettes…");
      return;
    }
    setAlertEmailLoadingId(alerte.alerte_id);
    try {
      const resolution = await resolveAlerteEmailAction(
        suiviAlerteToRef(alerte),
        etiquettes
      );
      switch (resolution.kind) {
        case "send": {
          if (!resolution.item.contact_email?.trim()) {
            toast.warning("Ajoutez l'email du contact avant d'envoyer.");
            onOpenContact?.(alerte.contact_id, alerteContactIds);
            return;
          }
          if (isEtiquetteQueueItemBatchLocked(resolution.item)) {
            toast.warning("Envoi groupé en cours — patientez ou annulez la salve.");
            return;
          }
          setAlertEmailItem(resolution.item);
          return;
        }
        case "followup":
          toast.info("Email déjà envoyé — utilisez « Relancer » dans Envois.");
          onOpenEnvoisTab();
          return;
        case "cancelled":
          toast.info("Envoi retiré de la file — onglet Retirés dans Envois.");
          sessionStorage.setItem("crm_nav_suivi_envois_subtab", "cancelled");
          onOpenEnvoisTab();
          return;
        case "sent_waiting":
        case "scheduled":
        case "incomplete":
          toast.info(resolution.message);
          onOpenEnvoisTab();
          return;
        case "no_campaign":
          toast.info("Aucune campagne email active pour cette alerte.");
          return;
      }
    } catch (error) {
      console.error(error);
      toast.error("Impossible de préparer l'envoi");
    } finally {
      setAlertEmailLoadingId(null);
    }
  };

  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const runBulkReporter = async (mois: number) => {
    const targets = alertesFiltered.filter((a) => selectedIds.has(a.alerte_id));
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      for (const alerte of targets) {
        await handleReporterSuivi(alerte, mois);
      }
      setSelectedIds(new Set());
      toast.success(`${targets.length} alerte(s) reportée(s)`);
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkDelete = async () => {
    const ids = [...selectedIds];
    if (ids.length === 0) return;
    setBulkBusy(true);
    try {
      for (const id of ids) {
        await handleSupprimer(id);
      }
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
    } finally {
      setBulkBusy(false);
    }
  };

  const clearFilter = (id: SuiviAlertesActiveFilterId) => {
    if (id === "category") updatePrefs({ categoryFilter: "all" });
    if (id === "urgency") updatePrefs({ urgencyFilter: null });
    if (id === "search") updatePrefs({ searchQuery: "" });
  };

  const renderAlerteCard = (alerte: AlerteWithContact) => (
    <SuiviAlerteCard
      key={alerte.alerte_id}
      alerte={alerte}
      etiquettes={etiquettes}
      viewMode={prefs.viewMode}
      showEmailAction={alerteHasActiveEmailCampaign(suiviAlerteToRef(alerte), etiquettes)}
      emailLoading={alertEmailLoadingId === alerte.alerte_id}
      hasLinkedTache={contactIdsWithTache.has(alerte.contact_id)}
      selected={selectedIds.has(alerte.alerte_id)}
      onToggleSelect={() => toggleSelect(alerte.alerte_id)}
      onOpenContact={onOpenContact ? openAlerteContact : undefined}
      onOpenHistorique={onOpenHistorique}
      onTraiter={() => openTraiterDialog(alerte)}
      onReporter={(mois) => void handleReporterSuivi(alerte, mois)}
      onSnooze={(days) => void handleSnooze(alerte, days)}
      onEnvoyerEmail={() => void handleEnvoyerEmailDepuisAlerte(alerte)}
      onPlanifierRdv={() => setRdvAlerte(alerte)}
      onCreateTache={() => setTacheFromAlerte(alerte)}
      onSupprimer={() => setDeleteTarget(alerte)}
      onOpenEtiquettesTab={onOpenEtiquettesTab}
    />
  );

  const tacheDraft = tacheFromAlerte ? buildTacheDraftFromAlerte(tacheFromAlerte) : null;

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Alertes de suivi</CardTitle>
          <CardDescription>
            {alertes.length} alerte{alertes.length > 1 ? "s" : ""} non traitée
            {alertes.length > 1 ? "s" : ""} — triées par urgence par défaut.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <SuiviAlertesHelp onNavigate={onNavigate} />

          {loading ? (
            <div className="text-center py-8 text-muted-foreground">Chargement…</div>
          ) : alertes.length === 0 ? (
            <div className="text-center py-8">
              <Check className="h-12 w-12 mx-auto mb-4 text-green-600" />
              <p className="text-muted-foreground">
                Aucune alerte en attente dans la liste de suivi.
              </p>
              {totalContactsAvecEtiquettes > 0 && (
                <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                  {totalContactsAvecEtiquettes} contact
                  {totalContactsAvecEtiquettes > 1 ? "s" : ""} ont une étiquette de relance
                  — voir Contacts étiquetés.
                </p>
              )}
            </div>
          ) : (
            <>
              <SuiviAlertesSummaryBanner
                totalCount={alertes.length}
                emailCampaignCount={emailCampaignCount}
                treatedThisWeek={treatedThisWeek}
                onOpenEnvois={onOpenEnvoisTab}
              />

              <SuiviAlertesUrgencyStatCards
                counts={urgencyCounts}
                activeFilter={prefs.urgencyFilter}
                onFilterChange={(f) => updatePrefs({ urgencyFilter: f })}
              />

              <SuiviAlertesToolbar
                searchQuery={prefs.searchQuery}
                onSearchChange={(q) => updatePrefs({ searchQuery: q })}
                sortMode={prefs.sortMode}
                onSortChange={(sortMode: AlerteSortMode) => updatePrefs({ sortMode })}
                viewMode={prefs.viewMode}
                onViewModeChange={(viewMode: AlerteViewMode) => updatePrefs({ viewMode })}
                categoryFilter={prefs.categoryFilter}
                categoryCounts={alerteCategoryCounts}
                onCategoryChange={(categoryFilter: AlerteCategoryFilter) =>
                  updatePrefs({ categoryFilter })
                }
                activeFilterChips={activeFilterChips}
                onClearFilter={clearFilter}
                onClearAll={() =>
                  updatePrefs({
                    categoryFilter: "all",
                    urgencyFilter: null,
                    searchQuery: "",
                  })
                }
              />

              <SuiviAlertesBulkBar
                selectedCount={selectedIds.size}
                onBulkReporter={(mois) => void runBulkReporter(mois)}
                onBulkDelete={() => setBulkDeleteOpen(true)}
                onClearSelection={() => setSelectedIds(new Set())}
                busy={bulkBusy}
              />

              {alertesFiltered.length === 0 ? (
                <p className="text-center py-8 text-muted-foreground text-sm">
                  Aucune alerte ne correspond aux filtres.
                </p>
              ) : (
                <div className="space-y-4">
                  {alerteSections.map((section) => (
                    <div key={section.id} className="space-y-3">
                      <SuiviAlertesSectionHeader
                        label={section.label}
                        count={section.alertes.length}
                      />
                      {section.alertes.map(renderAlerteCard)}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <Dialog
        open={alerteATraiter !== null}
        onOpenChange={(open) => {
          if (!open) setAlerteATraiter(null);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Marquer le suivi comme effectué</DialogTitle>
            <DialogDescription>
              {alerteATraiter && (
                <>
                  <span className="font-medium text-foreground">
                    {formatAlerteContactLabel(
                      alerteATraiter.message,
                      alerteATraiter.type_alerte
                    )}
                  </span>
                  {" · "}
                  {getTypeAlerteLabel(alerteATraiter.type_alerte)}
                  {isAlerteSuiviFilleul(alerteATraiter.type_alerte)
                    ? " — date dernier contact filleul."
                    : " — date dernier contact."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="date-dernier-suivi">Date du dernier suivi</Label>
            <SuiviAlertesTraiterDateShortcuts
              value={dateDernierSuivi}
              onChange={setDateDernierSuivi}
            />
            <Input
              id="date-dernier-suivi"
              type="date"
              value={dateDernierSuivi}
              onChange={(e) => setDateDernierSuivi(e.target.value)}
            />
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => setAlerteATraiter(null)}
              disabled={submittingTraiter}
            >
              Annuler
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void confirmTraiter(true)}
              disabled={submittingTraiter || !dateDernierSuivi}
            >
              Traiter et suivant
            </Button>
            <Button
              type="button"
              onClick={() => void confirmTraiter(false)}
              disabled={submittingTraiter || !dateDernierSuivi}
            >
              {submittingTraiter ? "Enregistrement…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette alerte ?</AlertDialogTitle>
            <AlertDialogDescription>
              L&apos;alerte sera retirée de la liste. Le contact n&apos;est pas modifié ; une
              nouvelle alerte pourra réapparaître au prochain recalcul.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              onClick={() => {
                if (deleteTarget) void handleSupprimer(deleteTarget.alerte_id);
                setDeleteTarget(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer {selectedIds.size} alerte{selectedIds.size > 1 ? "s" : ""} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Action irréversible sur la sélection actuelle.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-red-600 hover:bg-red-700"
              disabled={bulkBusy}
              onClick={() => void runBulkDelete()}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EtiquetteEmailSendDialog
        item={alertEmailItem}
        open={!!alertEmailItem}
        onOpenChange={(o) => !o && setAlertEmailItem(null)}
        onSent={() => {
          void onRefreshEmailCount();
          void onRefreshAlertes();
        }}
      />

      <PlanifierRdvDialog
        open={!!rdvAlerte}
        onOpenChange={(o) => !o && setRdvAlerte(null)}
        contactId={rdvAlerte?.contact_id ?? 0}
        contactLabel={
          rdvAlerte
            ? `${rdvAlerte.contact_prenom} ${rdvAlerte.contact_nom}`.trim()
            : ""
        }
        alerteId={rdvAlerte?.alerte_id}
        onCreated={() => void onRefreshAlertes()}
      />

      {tacheDraft && (
        <TacheForm
          open
          onOpenChange={(o) => !o && setTacheFromAlerte(null)}
          fixedContactIds={tacheDraft.contactIds}
          defaultTitle={tacheDraft.titre}
          defaultDateEcheance={tacheDraft.dateEcheance}
          creationContext="alerte"
          onSuccess={() => {
            setTacheFromAlerte(null);
            void loadTachesForIndicator();
            toast.success("Tâche créée");
          }}
        />
      )}
    </>
  );
}
