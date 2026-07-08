import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import { Check, Tag, Users } from "lucide-react";
import {
  genererAlertesAutomatiques,
  checkAndCreateDemembrementAlerts,
  countAlertesTraiteesDepuis,
} from "@/lib/api/tauri-alertes";
import { getAlertesWithContacts, type AlerteWithContact } from "@/lib/api/tauri-dashboard";
import { SuiviPageHeader } from "@/components/suivi/SuiviPageHeader";
import { SuiviAlertesTab } from "@/components/suivi/SuiviAlertesTab";
import { SuiviEtiquetteContactRow } from "@/components/suivi/SuiviEtiquetteContactRow";
import { SuiviSegmentsTab } from "@/components/suivi/SuiviSegmentsTab";
import { navigateToInteractions } from "@/lib/navigation/interactions-navigation";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { type Contact } from "@/lib/api/tauri-contacts";
import {
  getAllEtiquettesWithCount,
  getContactsByEtiquette,
  getAllContactEtiquettesDetails,
  retirerEtiquette,
  getContrastColor,
  getEtiquetteEmailQueue,
  type EtiquetteWithCount,
} from "@/lib/api/tauri-etiquettes";
import { getAllSegmentsWithCount } from "@/lib/api/tauri-segments";
import { getScpiCampaignDashboard } from "@/lib/api/tauri-scpi-campaign";
import { EtiquetteEnvoisTab } from "@/components/etiquettes/EtiquetteEnvoisTab";
import { EtiquettePipelineBoard } from "@/components/etiquettes/EtiquettePipelineBoard";
import { StelliumExceltisAlerts } from "@/components/etiquettes/StelliumExceltisAlerts";
import {
  isAutoEtiquetteAttribution,
  RemoveAutoEtiquetteDialog,
  type RemoveAutoEtiquetteTarget,
} from "@/components/etiquettes/RemoveAutoEtiquetteDialog";
import { buildEtiquetteAttributionMap } from "@/lib/etiquettes/etiquette-attribution-map";
import { useSuiviAutoRefresh } from "@/hooks/useSuiviAutoRefresh";
import { runFullEtiquettesRecalc } from "@/lib/etiquettes/sync-etiquettes-auto";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import {
  consumeSuiviNavigationIntent,
  loadPersistedSuiviActiveTab,
  persistSuiviActiveTab,
  setEnvoisContactFocus,
  setSuiviNavigationIntent,
  type SuiviMainTab,
} from "@/lib/navigation/suivi-navigation";
import { toast } from "sonner";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import {
  beginRefreshGeneration,
  isRefreshGenerationCurrent,
} from "@/lib/refresh-generation";
import { countUniqueTaggedContacts } from "@/lib/etiquettes/etiquettes-unique-count";

interface SuiviProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
}

export function Suivi({ currentPage, onNavigate }: SuiviProps) {
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
  const [activeTab, setActiveTab] = useState<SuiviMainTab>(
    () => loadPersistedSuiviActiveTab() ?? "alertes"
  );
  const [readyEmailCount, setReadyEmailCount] = useState(0);
  const [syncingEtiquettes, setSyncingEtiquettes] = useState(false);
  const [loadingEtiquettes, setLoadingEtiquettes] = useState(true);
  const [pendingSuiviContactId, setPendingSuiviContactId] = useState<number | null>(null);
  const [uniqueContactsTagged, setUniqueContactsTagged] = useState(0);
  const [segmentsCount, setSegmentsCount] = useState(0);
  const [treatedThisWeek, setTreatedThisWeek] = useState(0);
  const [scpiReadyCount, setScpiReadyCount] = useState(0);
  const [scpiPeriode, setScpiPeriode] = useState<string | null>(null);
  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;
  const alertesTabLoadedRef = useRef(false);
  const etiquettesTabLoadedRef = useRef(false);
  const alertesRefreshGenRef = useRef(0);

  const handleTabChange = useCallback((tab: SuiviMainTab) => {
    setActiveTab(tab);
    persistSuiviActiveTab(tab);
  }, []);

  const [pendingEtiquetteId, setPendingEtiquetteId] = useState<number | null>(null);

  const applySuiviNavigation = useCallback(
    (
      tab: SuiviMainTab | null,
      envoisSubTab: string | null,
      contactId: number | null,
      etiquetteId: number | null
    ) => {
      if (tab) setActiveTab(tab);
      if (tab) persistSuiviActiveTab(tab);
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

  const loadTreatedThisWeek = useCallback(async () => {
    try {
      const now = new Date();
      const day = now.getDay();
      const diff = day === 0 ? 6 : day - 1;
      const monday = new Date(now);
      monday.setDate(now.getDate() - diff);
      monday.setHours(0, 0, 0, 0);
      const sinceTs = Math.floor(monday.getTime() / 1000);
      setTreatedThisWeek(await countAlertesTraiteesDepuis(sinceTs));
    } catch {
      setTreatedThisWeek(0);
    }
  }, []);

  const loadSegmentsCount = useCallback(async () => {
    try {
      const list = await getAllSegmentsWithCount();
      setSegmentsCount(list.filter((s) => s.actif).length);
    } catch {
      setSegmentsCount(0);
    }
  }, []);

  const loadEmailQueueCount = useCallback(async () => {
    try {
      const [ready, dash] = await Promise.all([
        getEtiquetteEmailQueue("ready"),
        getScpiCampaignDashboard().catch(() => null),
      ]);
      setReadyEmailCount(ready.length);
      setScpiReadyCount(dash?.readyCount ?? 0);
      setScpiPeriode(dash?.lastPrepare?.periode ?? null);
    } catch {
      setReadyEmailCount(0);
      setScpiReadyCount(0);
      setScpiPeriode(null);
    }
  }, []);

  const fetchAlertesList = useCallback(async (options?: { silent?: boolean }) => {
    const showLoading = !options?.silent;
    const token = beginRefreshGeneration(alertesRefreshGenRef);
    try {
      if (showLoading) setLoading(true);
      const data = await getAlertesWithContacts();
      if (!isRefreshGenerationCurrent(alertesRefreshGenRef, token)) return;
      setAlertes(data);
    } catch (error) {
      if (!isRefreshGenerationCurrent(alertesRefreshGenRef, token)) return;
      console.error("Error loading alertes:", error);
      if (showLoading) toast.error("Erreur lors du chargement des alertes");
    } finally {
      if (!isRefreshGenerationCurrent(alertesRefreshGenRef, token)) return;
      if (showLoading) setLoading(false);
    }
  }, []);

  const regenerateAndLoadAlertes = useCallback(async (options?: { silent?: boolean }) => {
    const showLoading = !options?.silent;
    const token = beginRefreshGeneration(alertesRefreshGenRef);
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
      if (!isRefreshGenerationCurrent(alertesRefreshGenRef, token)) return;
      setAlertes(data);
    } catch (error) {
      if (!isRefreshGenerationCurrent(alertesRefreshGenRef, token)) return;
      console.error("Error loading alertes:", error);
      if (showLoading) toast.error("Erreur lors du chargement des alertes");
    } finally {
      if (!isRefreshGenerationCurrent(alertesRefreshGenRef, token)) return;
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

  const handleSelectEtiquette = useCallback(async (etiquette: EtiquetteWithCount) => {
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
  }, []);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- volontairement non mémoïsée ; l'effet consommateur est gardé par des refs (chargement 1× par onglet)
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
    skipEmailQueueOnWake: () => activeTabRef.current === "envois",
  });

  useEffect(() => {
    if (activeTab === "envois") {
      void loadEmailQueueCount();
    }
  }, [activeTab, loadEmailQueueCount]);

  useEffect(() => {
    const { tab, envoisSubTab, contactId, etiquetteId } = consumeSuiviNavigationIntent();
    applySuiviNavigation(tab, envoisSubTab, contactId, etiquetteId);
    const initialTab = tab ?? loadPersistedSuiviActiveTab() ?? "alertes";
    if (tab == null) {
      setActiveTab(initialTab);
      persistSuiviActiveTab(initialTab);
    }
    if (initialTab === "etiquettes") {
      etiquettesTabLoadedRef.current = true;
      void loadEtiquettes();
    } else if (initialTab === "envois") {
      void loadEmailQueueCount();
    } else if (initialTab === "alertes") {
      alertesTabLoadedRef.current = true;
      void regenerateAndLoadAlertes();
    }
    void loadEmailQueueCount();
    void loadSegmentsCount();
    void loadTreatedThisWeek();
    // Chargement initial à l'ouverture de la page Suivi
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (activeTab === "alertes" && !alertesTabLoadedRef.current) {
      alertesTabLoadedRef.current = true;
      void regenerateAndLoadAlertes();
    } else if (activeTab === "etiquettes" && !etiquettesTabLoadedRef.current) {
      etiquettesTabLoadedRef.current = true;
      void loadEtiquettes();
    } else if (activeTab === "envois") {
      void loadEmailQueueCount();
    }
  }, [activeTab, regenerateAndLoadAlertes, loadEtiquettes, loadEmailQueueCount]);

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
  }, [pendingEtiquetteId, loadingEtiquettes, etiquettes, handleSelectEtiquette]);

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

  const handleOpenEnvoisForContact = (contactId: number) => {
    setEnvoisContactFocus(contactId);
    handleTabChange("envois");
  };

  const handleSyncEtiquettes = async () => {
    setSyncingEtiquettes(true);
    try {
      toast.info("Recalcul des règles automatiques en cours…");
      const n = await runFullEtiquettesRecalc();
      await refreshEtiquetteCounts();
      await regenerateAndLoadAlertes({ silent: true });
      await loadTreatedThisWeek();
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

  const etiquetteContactIds = useMemo(
    () => etiquetteContacts.map((c) => c.id).filter((id): id is number => id != null),
    [etiquetteContacts]
  );

  const refreshAfterContactEdit = useCallback(() => {
    void fetchAlertesList({ silent: true });
    void loadTreatedThisWeek();
    if (selectedEtiquette) {
      void handleSelectEtiquette(selectedEtiquette);
    }
  }, [fetchAlertesList, loadTreatedThisWeek, selectedEtiquette, handleSelectEtiquette]);

  const { openContactSheet: openSuiviContactSheet, sheet: contactDetailSheet } =
    useContactDetailSheet({
      onNavigate,
      onUpdate: refreshAfterContactEdit,
    });

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
        scpiReadyCount={scpiReadyCount}
        scpiPeriode={scpiPeriode}
        segmentsCount={segmentsCount}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onSyncEtiquettes={() => void handleSyncEtiquettes()}
        syncingEtiquettes={syncingEtiquettes}
        loadingAlertes={loading}
        onConfigureEtiquettes={
          onNavigate ? () => onNavigate("etiquettes") : undefined
        }
      />

      <Tabs value={activeTab} onValueChange={(v) => handleTabChange(v as SuiviMainTab)}>
        <TabsContent value="alertes" className="mt-4">
          <SuiviAlertesTab
            alertes={alertes}
            loading={loading}
            etiquettes={etiquettes}
            loadingEtiquettes={loadingEtiquettes}
            totalContactsAvecEtiquettes={totalContactsAvecEtiquettes}
            treatedThisWeek={treatedThisWeek}
            onNavigate={onNavigate}
            onOpenContact={openSuiviContactSheet}
            onOpenHistorique={onNavigate ? openHistorique : undefined}
            onOpenEtiquettesTab={() => handleTabChange("etiquettes")}
            onOpenEnvoisTab={() => handleTabChange("envois")}
            onAlertesChange={setAlertes}
            onRefreshAlertes={async () => {
              await fetchAlertesList({ silent: true });
              await loadTreatedThisWeek();
            }}
            onRefreshEmailCount={loadEmailQueueCount}
            pendingContactId={pendingSuiviContactId}
            onPendingContactConsumed={() => setPendingSuiviContactId(null)}
          />
        </TabsContent>

        <TabsContent value="etiquettes" className="mt-4 space-y-4">
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
                    onOpenContact={openSuiviContactSheet}
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
                          contact.id != null
                            ? (contactId) =>
                                openSuiviContactSheet(contactId, etiquetteContactIds)
                            : undefined
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
          <SuiviSegmentsTab onOpenContact={openSuiviContactSheet} />
        </TabsContent>

        <TabsContent value="envois" className="mt-4">
          <EtiquetteEnvoisTab
            onQueueChanged={() => void loadEmailQueueCount()}
            onOpenContact={openSuiviContactSheet}
            onNavigate={onNavigate}
          />
        </TabsContent>
      </Tabs>

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

      {contactDetailSheet}
    </div>
  );
}
