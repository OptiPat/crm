import { useCallback, useEffect, useMemo, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Check, Filter, Mail, Tag, Users } from "lucide-react";
import {
  marquerAlerteTraitee,
  deleteAlerte,
  genererAlertesAutomatiques,
  checkAndCreateDemembrementAlerts,
  formatAlerteContactLabel,
} from "@/lib/api/tauri-alertes";
import { getAlertesWithContacts, type AlerteWithContact } from "@/lib/api/tauri-dashboard";
import { getTypeAlerteLabel } from "@/lib/alertes/alerte-labels";
import { suiviAlerteToRef } from "@/lib/suivi/suivi-alerte-ref";
import { SuiviPageHeader } from "@/components/suivi/SuiviPageHeader";
import { SuiviAlerteCard } from "@/components/suivi/SuiviAlerteCard";
import { SuiviAlertesFilters } from "@/components/suivi/SuiviAlertesFilters";
import { SuiviEtiquetteContactRow } from "@/components/suivi/SuiviEtiquetteContactRow";
import { SuiviSegmentsTab } from "@/components/suivi/SuiviSegmentsTab";
import {
  countAlertesByCategory,
  matchesAlerteCategoryFilter,
  type AlerteCategoryFilter,
} from "@/lib/alertes/alerte-category";
import { navigateToInteractions } from "@/lib/navigation/interactions-navigation";
import { getContactById, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import {
  addMonthsLocal,
  contactToUpdatePayload,
  isAlerteSuiviFilleul,
  suiviDatesOverrides,
  todayLocal,
} from "@/lib/contacts/contact-form-utils";
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
import {
  getAllEtiquettesWithCount,
  getContactsByEtiquette,
  getAllContactEtiquettesDetails,
  retirerEtiquette,
  getContrastColor,
  getEtiquetteEmailQueue,
  type EtiquetteEmailQueueItem,
  type EtiquetteWithCount,
} from "@/lib/api/tauri-etiquettes";
import { EtiquetteEnvoisTab } from "@/components/etiquettes/EtiquetteEnvoisTab";
import { EtiquettePipelineBoard } from "@/components/etiquettes/EtiquettePipelineBoard";
import { PlanifierRdvDialog } from "@/components/calendar/PlanifierRdvDialog";
import { StelliumExceltisAlerts } from "@/components/etiquettes/StelliumExceltisAlerts";
import {
  isAutoEtiquetteAttribution,
  RemoveAutoEtiquetteDialog,
  type RemoveAutoEtiquetteTarget,
} from "@/components/etiquettes/RemoveAutoEtiquetteDialog";
import { buildEtiquetteAttributionMap } from "@/lib/etiquettes/etiquette-attribution-map";
import { useSuiviAutoRefresh } from "@/hooks/useSuiviAutoRefresh";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";
import {
  notifyRelationChanged,
  notifyEtiquettesChanged,
} from "@/lib/etiquettes/etiquette-events";
import { ALERTE_ETIQUETTE_EXPLICATION } from "@/lib/alertes/alerte-etiquette-links";
import {
  alerteHasActiveEmailCampaign,
  resolveAlerteEmailAction,
} from "@/lib/alertes/alerte-email-queue";
import { EtiquetteEmailSendDialog } from "@/components/etiquettes/EtiquetteEmailSendDialog";
import {
  consumeSuiviNavigationIntent,
  setEnvoisContactFocus,
  setSuiviNavigationIntent,
  type SuiviMainTab,
} from "@/lib/navigation/suivi-navigation";
import { toast } from "sonner";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { countUniqueTaggedContacts } from "@/lib/etiquettes/etiquettes-unique-count";

interface SuiviProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onOpenContact?: (contactId: number) => void;
}

export function Suivi({ currentPage, onNavigate, onOpenContact }: SuiviProps) {
  const [alertes, setAlertes] = useState<AlerteWithContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [etiquettes, setEtiquettes] = useState<EtiquetteWithCount[]>([]);
  const [selectedEtiquette, setSelectedEtiquette] = useState<EtiquetteWithCount | null>(null);
  const [etiquetteContacts, setEtiquetteContacts] = useState<Contact[]>([]);
  const [etiquetteContactAttribuePar, setEtiquetteContactAttribuePar] = useState<
    Record<number, string>
  >({});
  const [etiquetteRemoveTarget, setEtiquetteRemoveTarget] =
    useState<RemoveAutoEtiquetteTarget | null>(null);
  const [loadingContacts, setLoadingContacts] = useState(false);
  const [activeTab, setActiveTab] = useState<SuiviMainTab>("alertes");
  const [reporterSelectKeys, setReporterSelectKeys] = useState<Record<number, number>>({});
  const [alerteATraiter, setAlerteATraiter] = useState<AlerteWithContact | null>(null);
  const [dateDernierSuivi, setDateDernierSuivi] = useState(todayLocal());
  const [submittingTraiter, setSubmittingTraiter] = useState(false);
  const [readyEmailCount, setReadyEmailCount] = useState(0);
  const [syncingEtiquettes, setSyncingEtiquettes] = useState(false);
  const [alertEmailItem, setAlertEmailItem] = useState<EtiquetteEmailQueueItem | null>(null);
  const [alertEmailLoadingId, setAlertEmailLoadingId] = useState<number | null>(null);
  const [loadingEtiquettes, setLoadingEtiquettes] = useState(true);
  const [pendingSuiviContactId, setPendingSuiviContactId] = useState<number | null>(null);
  const [uniqueContactsTagged, setUniqueContactsTagged] = useState(0);
  const [alerteCategoryFilter, setAlerteCategoryFilter] =
    useState<AlerteCategoryFilter>("all");
  const [rdvAlerte, setRdvAlerte] = useState<AlerteWithContact | null>(null);

  const alerteCategoryCounts = useMemo(
    () => countAlertesByCategory(alertes),
    [alertes]
  );

  const alertesFiltered = useMemo(
    () =>
      alertes.filter((a) =>
        matchesAlerteCategoryFilter(a.type_alerte, alerteCategoryFilter)
      ),
    [alertes, alerteCategoryFilter]
  );

  const [pendingEtiquetteId, setPendingEtiquetteId] = useState<number | null>(null);

  const applySuiviNavigation = useCallback(
    (
      tab: SuiviMainTab | null,
      envoisSubTab: string | null,
      contactId: number | null,
      etiquetteId: number | null
    ) => {
      if (tab) setActiveTab(tab);
      if (envoisSubTab) {
        sessionStorage.setItem("crm_nav_suivi_envois_subtab", envoisSubTab);
      }
      if (contactId != null) {
        if (tab === "envois") {
          setEnvoisContactFocus(contactId);
        } else {
          setPendingSuiviContactId(contactId);
        }
      }
      if (etiquetteId != null) {
        setPendingEtiquetteId(etiquetteId);
      }
    },
    []
  );

  useEffect(() => {
    if (pendingSuiviContactId == null || loading || activeTab !== "alertes") return;
    const contactId = pendingSuiviContactId;
    const alerte = alertes.find((a) => a.contact_id === contactId);
    if (alerte) {
      setAlerteATraiter(alerte);
      setDateDernierSuivi(todayLocal());
    } else if (onOpenContact) {
      onOpenContact(contactId);
    } else if (onNavigate) {
      sessionStorage.setItem("crm_open_contact_id", String(contactId));
      onNavigate("contacts");
    }
    setPendingSuiviContactId(null);
  }, [pendingSuiviContactId, loading, alertes, activeTab, onOpenContact, onNavigate]);

  const loadEmailQueueCount = useCallback(async () => {
    try {
      const ready = await getEtiquetteEmailQueue("ready");
      setReadyEmailCount(ready.length);
    } catch {
      setReadyEmailCount(0);
    }
  }, []);

  const fetchAlertesList = useCallback(async (options?: { silent?: boolean }) => {
    const showLoading = !options?.silent;
    try {
      if (showLoading) setLoading(true);
      const data = await getAlertesWithContacts();
      setAlertes(data);
    } catch (error) {
      console.error("Error loading alertes:", error);
      if (showLoading) toast.error("Erreur lors du chargement des alertes");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const regenerateAndLoadAlertes = useCallback(async (options?: { silent?: boolean }) => {
    const showLoading = !options?.silent;
    try {
      if (showLoading) setLoading(true);

      try {
        await checkAndCreateDemembrementAlerts();
      } catch (error) {
        console.error("Error demembrement alerts:", error);
      }

      try {
        await genererAlertesAutomatiques();
      } catch (error) {
        console.error("Error generating alertes:", error);
        if (showLoading) toast.error("Erreur lors de la génération des alertes");
      }

      const data = await getAlertesWithContacts();
      setAlertes(data);
    } catch (error) {
      console.error("Error loading alertes:", error);
      if (showLoading) toast.error("Erreur lors du chargement des alertes");
    } finally {
      if (showLoading) setLoading(false);
    }
  }, []);

  const sortEtiquettes = useCallback((data: EtiquetteWithCount[]) => {
    return [...data].sort((a, b) => {
      if (b.contact_count !== a.contact_count) {
        return b.contact_count - a.contact_count;
      }
      return b.priorite - a.priorite;
    });
  }, []);

  const refreshEtiquetteCounts = useCallback(async () => {
    try {
      const [sorted, details] = await Promise.all([
        sortEtiquettes(await getAllEtiquettesWithCount()),
        getAllContactEtiquettesDetails(),
      ]);
      setEtiquettes(sorted);
      setUniqueContactsTagged(countUniqueTaggedContacts(details));
      setSelectedEtiquette((prev) => {
        if (!prev) return prev;
        return sorted.find((e) => e.id === prev.id) ?? prev;
      });
    } catch (error) {
      console.error("Error refreshing etiquette counts:", error);
    }
  }, [sortEtiquettes]);

  const handleSelectEtiquette = async (etiquette: EtiquetteWithCount) => {
    setSelectedEtiquette(etiquette);
    setLoadingContacts(true);
    try {
      const [contacts, details] = await Promise.all([
        getContactsByEtiquette(etiquette.id),
        getAllContactEtiquettesDetails(),
      ]);
      setEtiquetteContacts(contacts);
      setEtiquetteContactAttribuePar(buildEtiquetteAttributionMap(details, etiquette.id));
    } catch (error) {
      console.error("Error loading contacts for etiquette:", error);
      setEtiquetteContacts([]);
      setEtiquetteContactAttribuePar({});
    } finally {
      setLoadingContacts(false);
    }
  };

  const loadEtiquettes = async () => {
    try {
      setLoadingEtiquettes(true);
      const sorted = sortEtiquettes(await getAllEtiquettesWithCount());
      setEtiquettes(sorted);

      const firstWithContacts = sorted.find((e) => e.contact_count > 0);
      if (firstWithContacts) {
        await handleSelectEtiquette(firstWithContacts);
      }
    } catch (error) {
      console.error("Error loading etiquettes:", error);
    } finally {
      setLoadingEtiquettes(false);
    }
  };

  useSuiviAutoRefresh({
    onRegenerateAlertes: () => regenerateAndLoadAlertes({ silent: true }),
    onFetchAlertes: () => fetchAlertesList({ silent: true }),
    onRefreshEtiquettes: refreshEtiquetteCounts,
    onRefreshEmailQueue: loadEmailQueueCount,
  });

  useEffect(() => {
    if (activeTab === "envois") {
      void loadEmailQueueCount();
    }
  }, [activeTab, loadEmailQueueCount]);

  useEffect(() => {
    const { tab, envoisSubTab, contactId, etiquetteId } = consumeSuiviNavigationIntent();
    applySuiviNavigation(tab, envoisSubTab, contactId, etiquetteId);
    void regenerateAndLoadAlertes();
    void loadEtiquettes();
    void loadEmailQueueCount();
    // Chargement initial à l'ouverture de la page Suivi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useAppNavigationListener((detail) => {
    if (detail.type !== "suivi") return;
    setSuiviNavigationIntent(
      detail.tab,
      detail.envoisSubTab,
      detail.contactId,
      detail.etiquetteId
    );
    applySuiviNavigation(
      detail.tab,
      detail.envoisSubTab ?? null,
      detail.contactId ?? null,
      detail.etiquetteId ?? null
    );
  }, [applySuiviNavigation]);

  useEffect(() => {
    if (pendingEtiquetteId == null || loadingEtiquettes) return;
    const etiqu = etiquettes.find((e) => e.id === pendingEtiquetteId);
    if (etiqu) {
      void handleSelectEtiquette(etiqu);
      setPendingEtiquetteId(null);
    }
    // handleSelectEtiquette : stable enough pour une sélection ponctuelle via navigation
    // eslint-disable-next-line react-hooks/exhaustive-deps -- pendingEtiquetteId consommé une fois
  }, [pendingEtiquetteId, loadingEtiquettes, etiquettes]);

  const confirmRetirerEtiquetteContact = async (
    contactId: number,
    excludeFromAuto: boolean
  ) => {
    if (!selectedEtiquette) return;
    try {
      await retirerEtiquette(contactId, selectedEtiquette.id, excludeFromAuto);
      toast.success(
        excludeFromAuto
          ? "Étiquette retirée — ne sera plus appliquée automatiquement"
          : "Étiquette retirée"
      );
      await handleSelectEtiquette(selectedEtiquette);
      await loadEtiquettes();
      notifyEtiquettesChanged();
    } catch (error) {
      console.error("Error removing etiquette:", error);
      toast.error("Erreur lors du retrait de l'étiquette");
    } finally {
      setEtiquetteRemoveTarget(null);
    }
  };

  const handleRetirerEtiquetteContact = (contactId: number) => {
    if (!selectedEtiquette) return;
    const attribuePar = etiquetteContactAttribuePar[contactId];
    if (isAutoEtiquetteAttribution(attribuePar)) {
      setEtiquetteRemoveTarget({
        contactId,
        etiquetteId: selectedEtiquette.id,
        etiquetteNom: selectedEtiquette.nom,
      });
      return;
    }
    void confirmRetirerEtiquetteContact(contactId, false);
  };

  const openTraiterDialog = (alerte: AlerteWithContact) => {
    setAlerteATraiter(alerte);
    setDateDernierSuivi(todayLocal());
  };

  const handleOpenEnvoisForContact = (contactId: number) => {
    setEnvoisContactFocus(contactId);
    setActiveTab("envois");
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
            onOpenContact?.(alerte.contact_id);
            return;
          }
          setAlertEmailItem(resolution.item);
          return;
        }
        case "followup":
          toast.info(
            "Email déjà envoyé — utilisez « Relancer » dans Suivi → Envois → À relancer."
          );
          setActiveTab("envois");
          return;
        case "cancelled":
          toast.info(
            "Envoi retiré de la file — onglet « Retirés » dans Suivi → Envois, bouton Remettre."
          );
          sessionStorage.setItem("crm_nav_suivi_envois_subtab", "cancelled");
          setActiveTab("envois");
          return;
        case "sent_waiting":
        case "scheduled":
        case "incomplete":
          toast.info(resolution.message);
          setActiveTab("envois");
          return;
        case "no_campaign":
          toast.info(
            "Aucune campagne email active pour cette alerte. Activez-la sur l'étiquette liée."
          );
          return;
      }
    } catch (error) {
      console.error(error);
      toast.error("Impossible de préparer l'envoi");
    } finally {
      setAlertEmailLoadingId(null);
    }
  };

  const confirmTraiter = async () => {
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
      const treatedContactId = alerteATraiter.contact_id;
      setAlertes((prev) => prev.filter((a) => a.alerte_id !== alerteATraiter.alerte_id));
      setAlerteATraiter(null);
      toast.success("Suivi enregistré sur le contact");
      notifyRelationChanged(treatedContactId);
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
      setAlertes((prev) => prev.filter((a) => a.alerte_id !== alerte.alerte_id));
      setReporterSelectKeys((prev) => ({
        ...prev,
        [alerte.alerte_id]: (prev[alerte.alerte_id] ?? 0) + 1,
      }));
      toast.success(`Suivi reporté de ${mois} mois`);
      notifyRelationChanged(alerte.contact_id);
    } catch (error) {
      console.error("Error reporting suivi:", error);
      toast.error("Erreur lors du report du suivi");
    }
  };

  const handleSupprimer = async (id: number) => {
    try {
      await deleteAlerte(id);
      setAlertes((prev) => prev.filter((a) => a.alerte_id !== id));
      toast.success("Alerte supprimée");
    } catch (error) {
      console.error("Error deleting alerte:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleSyncEtiquettes = async () => {
    setSyncingEtiquettes(true);
    try {
      toast.info("Recalcul des règles automatiques en cours…");
      const n = await runFullEtiquettesRecalc();
      await refreshEtiquetteCounts();
      await regenerateAndLoadAlertes({ silent: true });
      toast.success(
        n > 0
          ? `Recalcul terminé — ${n} attribution${n > 1 ? "s" : ""} automatique${n > 1 ? "s" : ""}`
          : "Recalcul terminé — étiquettes à jour"
      );
    } catch {
      toast.error("Erreur lors de la synchronisation des étiquettes");
    } finally {
      setSyncingEtiquettes(false);
    }
  };

  const totalContactsAvecEtiquettes = uniqueContactsTagged;

  const openContact = (contactId: number) => {
    if (onOpenContact) {
      onOpenContact(contactId);
    } else if (onNavigate) {
      sessionStorage.setItem("crm_open_contact_id", String(contactId));
      onNavigate("contacts");
    }
  };

  const openHistorique = (contactId: number) => {
    if (onNavigate) {
      navigateToInteractions(onNavigate, contactId, currentPage);
    } else {
      toast.info("Ouvrez l'historique depuis le menu Relation client.");
    }
  };

  return (
    <div className="space-y-6">
      <SuiviPageHeader
        alertesCount={alertes.length}
        etiquettesContactsCount={totalContactsAvecEtiquettes}
        readyEmailCount={readyEmailCount}
        activeTab={activeTab}
        onTabChange={setActiveTab}
        onSyncEtiquettes={() => void handleSyncEtiquettes()}
        syncingEtiquettes={syncingEtiquettes}
        loadingAlertes={loading}
        onConfigureEtiquettes={
          onNavigate ? () => onNavigate("etiquettes") : undefined
        }
      />

      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as SuiviMainTab)}
      >
        <TabsList>
          <TabsTrigger value="alertes" className="gap-2">
            <AlertCircle className="h-4 w-4" />
            Alertes
            {alertes.length > 0 && (
              <Badge variant="secondary" className="ml-1">{alertes.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="etiquettes" className="gap-2">
            <Tag className="h-4 w-4" />
            Contacts étiquetés
            {totalContactsAvecEtiquettes > 0 && (
              <Badge variant="secondary" className="ml-1">{totalContactsAvecEtiquettes}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="segments" className="gap-2">
            <Filter className="h-4 w-4" />
            Par segment
          </TabsTrigger>
          <TabsTrigger value="envois" className="gap-2">
            <Mail className="h-4 w-4" />
            Envois
            {readyEmailCount > 0 && (
              <Badge variant="secondary" className="ml-1 bg-blue-600 text-white">
                {readyEmailCount}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="alertes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>Alertes de suivi</CardTitle>
              <CardDescription>
                {alertes.length} alerte{alertes.length > 1 ? "s" : ""} non traitée
                {alertes.length > 1 ? "s" : ""}. {ALERTE_ETIQUETTE_EXPLICATION}
              </CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">
                  Chargement...
                </div>
              ) : alertes.length === 0 ? (
                <div className="text-center py-8">
                  <Check className="h-12 w-12 mx-auto mb-4 text-green-600" />
                  <p className="text-muted-foreground">
                    Aucune alerte en attente dans la liste de suivi.
                  </p>
                  {totalContactsAvecEtiquettes > 0 && (
                    <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
                      {totalContactsAvecEtiquettes} contact
                      {totalContactsAvecEtiquettes > 1 ? "s" : ""} ont une étiquette de
                      relance — voir l&apos;onglet Contacts étiquetés.
                    </p>
                  )}
                </div>
              ) : (
                <>
                  <SuiviAlertesFilters
                    value={alerteCategoryFilter}
                    counts={alerteCategoryCounts}
                    onChange={setAlerteCategoryFilter}
                  />
                  {alertesFiltered.length === 0 ? (
                    <p className="text-center py-8 text-muted-foreground text-sm">
                      Aucune alerte dans cette catégorie.
                    </p>
                  ) : (
                    <div className="space-y-3">
                      {alertesFiltered.map((alerte) => (
                        <SuiviAlerteCard
                          key={alerte.alerte_id}
                          alerte={alerte}
                          etiquettes={etiquettes}
                          reporterSelectKey={reporterSelectKeys[alerte.alerte_id] ?? 0}
                          showEmailAction={alerteHasActiveEmailCampaign(
                            suiviAlerteToRef(alerte),
                            etiquettes
                          )}
                          emailLoading={alertEmailLoadingId === alerte.alerte_id}
                          onOpenContact={
                            onOpenContact || onNavigate ? openContact : undefined
                          }
                          onOpenHistorique={onNavigate ? openHistorique : undefined}
                          onTraiter={() => openTraiterDialog(alerte)}
                          onReporter={(mois) =>
                            void handleReporterSuivi(alerte, mois)
                          }
                          onEnvoyerEmail={() =>
                            void handleEnvoyerEmailDepuisAlerte(alerte)
                          }
                          onPlanifierRdv={() => setRdvAlerte(alerte)}
                          onSupprimer={() => void handleSupprimer(alerte.alerte_id)}
                          onOpenEtiquettesTab={() => setActiveTab("etiquettes")}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="etiquettes" className="mt-4">
          <StelliumExceltisAlerts
            onOpenEtiquette={(id) => {
              const etiqu = etiquettes.find((e) => e.id === id);
              if (etiqu) void handleSelectEtiquette(etiqu);
            }}
          />
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-1">
              <CardHeader>
                <CardTitle className="text-lg">Files de relance</CardTitle>
                <CardDescription>
                  Étiquettes avec au moins un contact — sélectionnez pour agir
                </CardDescription>
              </CardHeader>
              <CardContent>
                {etiquettes.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    Aucune étiquette
                  </p>
                ) : (
                  <div className="space-y-2">
                    {etiquettes.filter(e => e.contact_count > 0 && e.actif !== false).map((etiquette) => (
                      <button
                        key={etiquette.id}
                        onClick={() => handleSelectEtiquette(etiquette)}
                        className={`w-full flex items-center justify-between p-3 rounded-lg border transition-all text-left ${
                          selectedEtiquette?.id === etiquette.id
                            ? "border-primary bg-primary/5"
                            : "border-border hover:bg-muted"
                        }`}
                      >
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: etiquette.couleur,
                            color: getContrastColor(etiquette.couleur)
                          }}
                        >
                          <span>{etiquette.nom}</span>
                        </span>
                        <Badge variant="secondary">
                          {etiquette.contact_count}
                        </Badge>
                      </button>
                    ))}
                    
                    {etiquettes.filter(e => e.contact_count > 0).length === 0 && (
                      <p className="text-sm text-muted-foreground text-center py-4">
                        Aucun contact étiqueté
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Contacts de l'étiquette sélectionnée */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Users className="h-5 w-5" />
                      {selectedEtiquette ? (
                        <span
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-sm font-medium"
                          style={{
                            backgroundColor: selectedEtiquette.couleur,
                            color: getContrastColor(selectedEtiquette.couleur)
                          }}
                        >
                          <span>{selectedEtiquette.nom}</span>
                        </span>
                      ) : (
                        "Contacts"
                      )}
                    </CardTitle>
                    <CardDescription>
                      {selectedEtiquette
                        ? `${etiquetteContacts.length} contact${etiquetteContacts.length > 1 ? "s" : ""}`
                        : "Sélectionnez une étiquette"}
                    </CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {selectedEtiquette?.pipeline_actif && (
                  <EtiquettePipelineBoard
                    etiquetteId={selectedEtiquette.id}
                    onOpenContact={openContact}
                  />
                )}
                {!selectedEtiquette ? (
                  <div className="text-center py-8">
                    <Tag className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
                    <p className="text-muted-foreground">
                      Sélectionnez une étiquette pour voir les contacts associés
                    </p>
                  </div>
                ) : loadingContacts ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Chargement...
                  </div>
                ) : etiquetteContacts.length === 0 ? (
                  <div className="text-center py-8">
                    <Check className="h-12 w-12 mx-auto mb-4 text-green-600" />
                    <p className="text-muted-foreground">
                      Aucun contact avec cette étiquette
                    </p>
                  </div>
                ) : (
                  <div className="space-y-2">
                    {etiquetteContacts.map((contact) => (
                      <SuiviEtiquetteContactRow
                        key={contact.id}
                        contact={contact}
                        onOpenContact={
                          onOpenContact || onNavigate ? openContact : undefined
                        }
                        onOpenEnvois={handleOpenEnvoisForContact}
                        onRetirerEtiquette={handleRetirerEtiquetteContact}
                      />
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        <TabsContent value="segments" className="mt-4">
          <SuiviSegmentsTab
            onOpenContact={
              onOpenContact || onNavigate ? openContact : undefined
            }
          />
        </TabsContent>

        <TabsContent value="envois" className="mt-4">
          <EtiquetteEnvoisTab
            onQueueChanged={() => void loadEmailQueueCount()}
            onOpenContact={openContact}
          />
        </TabsContent>
      </Tabs>

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
                    ? " — mise à jour de la date de dernier contact filleul."
                    : " — mise à jour de la date de dernier contact."}
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="date-dernier-suivi">Date du dernier suivi</Label>
            <Input
              id="date-dernier-suivi"
              type="date"
              value={dateDernierSuivi}
              onChange={(e) => setDateDernierSuivi(e.target.value)}
            />
          </div>
          <DialogFooter>
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
              onClick={() => void confirmTraiter()}
              disabled={submittingTraiter || !dateDernierSuivi}
            >
              {submittingTraiter ? "Enregistrement…" : "Confirmer"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <EtiquetteEmailSendDialog
        item={alertEmailItem}
        open={!!alertEmailItem}
        onOpenChange={(o) => !o && setAlertEmailItem(null)}
        onSent={() => {
          void loadEmailQueueCount();
          void fetchAlertesList({ silent: true });
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
        onCreated={() => void fetchAlertesList({ silent: true })}
      />

      <RemoveAutoEtiquetteDialog
        target={etiquetteRemoveTarget}
        onOpenChange={(open) => !open && setEtiquetteRemoveTarget(null)}
        onConfirm={(excludeFromAuto) => {
          if (!etiquetteRemoveTarget) return;
          void confirmRetirerEtiquetteContact(
            etiquetteRemoveTarget.contactId,
            excludeFromAuto
          );
        }}
      />
    </div>
  );
}
