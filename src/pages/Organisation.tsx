import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GitBranch, ListTree, Network, Settings, Upload, Users2 } from "lucide-react";
import { toast } from "sonner";
import { getAllContacts, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { contactFilleulRankUpdatePayload, contactFilleulVolumeUpdatePayload, contactFilleulManagerVolumeUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { getCgpConfig, type CgpConfig } from "@/lib/api/tauri-settings";
import {
  buildOrganisationTree,
  collectOrganisationDossierContactIds,
  resolveOrganisationSelfContact,
} from "@/lib/organisation/organisation-tree";
import { OrganisationTreeView } from "@/components/organisation/OrganisationTreeView";
import { OrganisationBranchVolumesPanel } from "@/components/organisation/OrganisationBranchVolumesPanel";
import { DashboardDrillDownBackdrop } from "@/components/dashboard/DashboardDrillDownBackdrop";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { requestOpenParametres } from "@/lib/navigation/app-navigation";
import {
  OrganisationExerciceSelector,
  ORGANISATION_CURRENT_EXERCICE,
} from "@/components/organisation/OrganisationExerciceSelector";
import {
  OrganisationExerciceCloseButton,
  OrganisationExerciceCloseDialog,
} from "@/components/organisation/OrganisationExerciceCloseDialog";
import {
  OrganisationExerciceReopenButton,
  OrganisationExerciceReopenDialog,
} from "@/components/organisation/OrganisationExerciceReopenDialog";
import { buildOrganisationVolumeRows } from "@/lib/organisation/organisation-branch-volumes";
import {
  buildCloseFilleulExerciceSnapshots,
  buildCloseFilleulExerciceSnapshotsFromHistory,
  buildOrganisationVolumeRowsForExercice,
  indexFilleulVolumeExercicesByContactId,
  isCurrentOrganisationExercice,
  isLiveFilleulExerciceVolumes,
  resolveOrganisationExerciceLabel,
  type OrganisationExerciceSelection,
} from "@/lib/organisation/organisation-volume-history";
import {
  exerciceIsClosed,
  getFilleulVolumeExercicesByLabel,
  importFilleulVolumeExercices,
  listClosedFilleulVolumeExerciceLabels,
  listFilleulVolumeExerciceLabels,
} from "@/lib/api/tauri-filleul-volumes";
import { currentFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import { OrganisationVolumesImportDialog } from "@/components/organisation/OrganisationVolumesImportDialog";
import { OrganisationMemberSearch } from "@/components/organisation/OrganisationMemberSearch";
import { OrganisationMemberDossierPanel } from "@/components/organisation/OrganisationMemberDossierPanel";
import { OrganisationHierarchyList } from "@/components/organisation/OrganisationHierarchyList";
import { buildOrganisationSearchRoster } from "@/lib/organisation/organisation-member-roster";
import {
  indexFilleulDossiersByContactId,
  mergeLegacyFilleulDossierView,
} from "@/lib/organisation/organisation-filleul-dossier";
import { getFilleulDossiersByContactIds, type FilleulDossier } from "@/lib/api/tauri-filleul-dossier";
import type { OrganisationTreeViewportHandle } from "@/components/organisation/OrganisationTreeViewport";

type OrganisationProps = {
  onNavigate?: (page: string) => void;
};

export function Organisation({ onNavigate }: OrganisationProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [cgp, setCgp] = useState<CgpConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const [historyExerciceLabels, setHistoryExerciceLabels] = useState<string[]>([]);
  const [closedExerciceLabels, setClosedExerciceLabels] = useState<string[]>([]);
  const [selectedExercice, setSelectedExercice] =
    useState<OrganisationExerciceSelection>(ORGANISATION_CURRENT_EXERCICE);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<
    Awaited<ReturnType<typeof getFilleulVolumeExercicesByLabel>>
  >([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
  const [reopenDialogOpen, setReopenDialogOpen] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [currentExerciceClosed, setCurrentExerciceClosed] = useState(false);
  const [selectedDossierContactId, setSelectedDossierContactId] = useState<number | null>(null);
  const [focusContactId, setFocusContactId] = useState<number | null>(null);
  const [networkView, setNetworkView] = useState<"pilotage" | "carte">("pilotage");
  const [dataRevision, setDataRevision] = useState(0);
  const [dossiersByContactId, setDossiersByContactId] = useState<Map<number, FilleulDossier>>(
    new Map()
  );
  const treeViewportRef = useRef<OrganisationTreeViewportHandle>(null);

  const loadData = useCallback(async () => {
    try {
      const [loadedContacts, loadedCgp, historyLabels, closedLabels] = await Promise.all([
        getAllContacts(),
        getCgpConfig(),
        listFilleulVolumeExerciceLabels(),
        listClosedFilleulVolumeExerciceLabels(),
      ]);
      setContacts(loadedContacts);
      setCgp(loadedCgp);
      setHistoryExerciceLabels(historyLabels);
      setClosedExerciceLabels(closedLabels);
      const currentLabel = currentFiscalYearLabel();
      setCurrentExerciceClosed(await exerciceIsClosed(currentLabel));
      setDataRevision((revision) => revision + 1);
    } catch (error) {
      console.error("Error loading organisation:", error);
      toast.error("Impossible de charger l'organisation");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEventAutoRefresh(loadData, subscribeContactsChanged);

  const resolvedExerciceLabel = useMemo(
    () => resolveOrganisationExerciceLabel(selectedExercice),
    [selectedExercice]
  );

  const selfContact = useMemo(
    () => resolveOrganisationSelfContact(contacts, cgp ?? {}),
    [contacts, cgp]
  );

  const [hideDesinscritsInTree, setHideDesinscritsInTree] = useState(false);

  const treeVisibilityOptions = useMemo(
    () => ({
      exerciceLabel: resolvedExerciceLabel,
      dossiersByContactId,
      hideDesinscrits: hideDesinscritsInTree,
    }),
    [resolvedExerciceLabel, dossiersByContactId, hideDesinscritsInTree]
  );

  const tree = useMemo(
    () => buildOrganisationTree(contacts, cgp ?? {}, treeVisibilityOptions),
    [contacts, cgp, treeVisibilityOptions]
  );

  const viewingLiveVolumes = useMemo(
    () => isLiveFilleulExerciceVolumes(resolvedExerciceLabel, closedExerciceLabels),
    [resolvedExerciceLabel, closedExerciceLabels]
  );

  const viewingCurrentExercice = useMemo(
    () =>
      isCurrentOrganisationExercice(selectedExercice) ||
      (selectedExercice === currentFiscalYearLabel() && !closedExerciceLabels.includes(selectedExercice)),
    [selectedExercice, closedExerciceLabels]
  );

  const selectedExerciceClosed = closedExerciceLabels.includes(resolvedExerciceLabel);

  const closeSnapshots = useMemo(() => {
    if (viewingLiveVolumes) {
      return buildCloseFilleulExerciceSnapshots(tree, contacts);
    }
    return buildCloseFilleulExerciceSnapshotsFromHistory(historyRecords);
  }, [viewingLiveVolumes, tree, contacts, historyRecords]);

  const canCloseSelectedExercice = useMemo(() => {
    if (selectedExerciceClosed) return false;
    if (viewingLiveVolumes) {
      return viewingCurrentExercice && tree.stats.total > 0;
    }
    return !historyLoading && historyRecords.length > 0;
  }, [
    selectedExerciceClosed,
    tree.stats.total,
    viewingLiveVolumes,
    viewingCurrentExercice,
    historyLoading,
    historyRecords.length,
  ]);

  const closeDialogAllowResetOwnVolumes = viewingLiveVolumes && viewingCurrentExercice;

  const canReopenSelectedExercice = useMemo(() => {
    return selectedExerciceClosed && !historyLoading;
  }, [selectedExerciceClosed, historyLoading]);

  const reopenDialogAllowRestoreOwnVolumes =
    resolvedExerciceLabel === currentFiscalYearLabel();

  const reopenSnapshotCount = useMemo(() => {
    if (!selectedExerciceClosed) return 0;
    if (historyRecords.length > 0) return historyRecords.length;
    return closeSnapshots.length;
  }, [selectedExerciceClosed, historyRecords.length, closeSnapshots.length]);

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      if (viewingLiveVolumes) {
        setHistoryRecords([]);
        return;
      }
      setHistoryRecords([]);
      setHistoryLoading(true);
      try {
        const records = await getFilleulVolumeExercicesByLabel(resolvedExerciceLabel);
        if (!cancelled) setHistoryRecords(records);
      } catch (error) {
        console.error(error);
        if (!cancelled) toast.error("Impossible de charger l'historique des volumes");
      } finally {
        if (!cancelled) setHistoryLoading(false);
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [resolvedExerciceLabel, viewingLiveVolumes]);

  /** Recharge l'historique après une correction ponctuelle (exercice passé non clôturé). */
  const refreshHistoryRecords = useCallback(async () => {
    if (viewingLiveVolumes) return;
    try {
      const records = await getFilleulVolumeExercicesByLabel(resolvedExerciceLabel);
      setHistoryRecords(records);
    } catch (error) {
      console.error(error);
    }
  }, [resolvedExerciceLabel, viewingLiveVolumes]);

  const volumeRows = useMemo(() => {
    if (viewingLiveVolumes) {
      return buildOrganisationVolumeRows(tree, contacts);
    }
    // Exercice passé non clôturé sans historique : lignes à zéro, prêtes à être corrigées.
    if (historyLoading) return [];
    return buildOrganisationVolumeRowsForExercice(tree, contacts, {
      mode: "history",
      recordsByContactId: indexFilleulVolumeExercicesByContactId(historyRecords),
    });
  }, [viewingLiveVolumes, tree, contacts, historyRecords, historyLoading]);

  const showBranchVolumesPanel = volumeRows.length > 0;

  const searchRoster = useMemo(
    () => buildOrganisationSearchRoster(contacts, cgp ?? {}),
    [contacts, cgp]
  );

  const dossierMemberIdsKey = useMemo(() => {
    const ids = collectOrganisationDossierContactIds(contacts, selfContact);
    if (ids.length === 0) return "";
    return ids.slice().sort((a, b) => a - b).join(",");
  }, [contacts, selfContact]);

  useEffect(() => {
    let cancelled = false;
    if (!dossierMemberIdsKey) {
      setDossiersByContactId((prev) => (prev.size === 0 ? prev : new Map()));
      return;
    }
    const ids = dossierMemberIdsKey.split(",").map((id) => Number(id));
    void getFilleulDossiersByContactIds(ids)
      .then((rows) => {
        if (cancelled) return;
        const next = indexFilleulDossiersByContactId(rows);
        setDossiersByContactId((prev) => {
          if (prev.size === next.size) {
            let same = true;
            for (const [id, dossier] of next) {
              const existing = prev.get(id);
              if (!existing || existing.updatedAt !== dossier.updatedAt) {
                same = false;
                break;
              }
            }
            if (same) return prev;
          }
          return next;
        });
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Impossible de charger les dossiers réseau");
      });
    return () => {
      cancelled = true;
    };
  }, [dossierMemberIdsKey, dataRevision]);

  const handleDossierChange = useCallback((next: FilleulDossier) => {
    setDossiersByContactId((prev) => {
      const map = new Map(prev);
      map.set(next.contactId, next);
      return map;
    });
  }, []);

  const handleNetworkDataChange = useCallback(() => {
    void loadData();
  }, [loadData]);

  const { openContactWithTab, sheet: contactDetailSheet, activeContactId, isOpen: contactDetailOpen } =
    useContactDetailSheet({
      onNavigate,
      onUpdate: () => void loadData(),
    });

  const handleNodeClick = useCallback((contact: Contact) => {
    if (contact.id == null) return;
    setSelectedDossierContactId(contact.id);
  }, []);

  const handleMemberSelect = useCallback((contactId: number) => {
    setSelectedDossierContactId(contactId);
    setFocusContactId(contactId);
    setNetworkView("pilotage");
  }, []);

  const handleFocusInTree = useCallback((contactId: number) => {
    setFocusContactId(contactId);
    setNetworkView("carte");
    requestAnimationFrame(() => {
      treeViewportRef.current?.focusNode(contactId);
    });
  }, []);

  const handleParrainClick = useCallback((parrainId: number) => {
    setSelectedDossierContactId(parrainId);
  }, []);

  const handleOpenContactSheet = useCallback(
    (contactId: number) => {
      void openContactWithTab(contactId, undefined, {
        stacked: selectedDossierContactId != null,
      });
    },
    [openContactWithTab, selectedDossierContactId]
  );

  const handleRankSave = useCallback(
    async (
      contact: Contact,
      ranks: { filleul_titre?: string | null; filleul_qualification?: string | null }
    ) => {
      try {
        await updateContact(contact.id, contactFilleulRankUpdatePayload(contact, ranks));
        toast.success("Titre et qualification enregistrés");
      } catch (error) {
        console.error("Error saving filleul ranks:", error);
        toast.error("Impossible d'enregistrer le titre");
        throw error;
      }
    },
    []
  );

  const handleVolumeSave = useCallback(
    async (contact: Contact, volume: number | null) => {
      try {
        await updateContact(contact.id, contactFilleulVolumeUpdatePayload(contact, volume));
        toast.success("Volume exercice enregistré");
      } catch (error) {
        console.error("Error saving filleul volume:", error);
        toast.error("Impossible d'enregistrer le volume");
        throw error;
      }
    },
    []
  );

  const handleManagerVolumeSave = useCallback(
    async (contact: Contact, volume: number | null) => {
      try {
        await updateContact(
          contact.id,
          contactFilleulManagerVolumeUpdatePayload(contact, volume)
        );
        toast.success("Objectif Manager enregistré");
      } catch (error) {
        console.error("Error saving manager volume:", error);
        toast.error("Impossible d'enregistrer l'objectif Manager");
        throw error;
      }
    },
    []
  );

  /** Correction du volume propre sur un exercice passé non clôturé (pas l'exercice en cours). */
  const handleHistoricalVolumeSave = useCallback(
    async (contact: Contact, volume: number | null) => {
      if (contact.id == null) return;
      try {
        await importFilleulVolumeExercices({
          entries: [
            {
              contactId: contact.id,
              exerciceLabel: resolvedExerciceLabel,
              volumePropre: volume ?? 0,
            },
          ],
          syncCurrentContactVolumes: false,
        });
        toast.success("Volume propre enregistré");
        await refreshHistoryRecords();
      } catch (error) {
        console.error("Error saving historical filleul volume:", error);
        toast.error("Impossible d'enregistrer le volume");
        throw error;
      }
    },
    [resolvedExerciceLabel, refreshHistoryRecords]
  );

  /** Correction du volume organisation (branche) sur un exercice passé non clôturé. */
  const handleHistoricalBranchVolumeSave = useCallback(
    async (contact: Contact, volume: number | null) => {
      if (contact.id == null) return;
      try {
        await importFilleulVolumeExercices({
          entries: [
            {
              contactId: contact.id,
              exerciceLabel: resolvedExerciceLabel,
              volumeBranche: volume ?? 0,
            },
          ],
          syncCurrentContactVolumes: false,
        });
        toast.success("Volume organisation enregistré");
        await refreshHistoryRecords();
      } catch (error) {
        console.error("Error saving historical branch volume:", error);
        toast.error("Impossible d'enregistrer le volume organisation");
        throw error;
      }
    },
    [resolvedExerciceLabel, refreshHistoryRecords]
  );

  const missingSelfContact = !loading && tree.selfContact == null;
  const organisationDrillDownOpen =
    selectedDossierContactId != null || contactDetailOpen;

  return (
    <div className="space-y-4 p-3 sm:p-4">
      {organisationDrillDownOpen ? <DashboardDrillDownBackdrop /> : null}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <GitBranch className="h-6 w-6 text-primary" aria-hidden />
            Organisation
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Réseau filleuls et parrains.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <OrganisationMemberSearch
            roster={searchRoster}
            onSelect={handleMemberSelect}
          />
          <OrganisationExerciceSelector
            historyExerciceLabels={historyExerciceLabels}
            closedExerciceLabels={closedExerciceLabels}
            value={selectedExercice}
            onValueChange={setSelectedExercice}
          />
          {canCloseSelectedExercice ? (
            <OrganisationExerciceCloseButton onClick={() => setCloseDialogOpen(true)} />
          ) : null}
          {canReopenSelectedExercice ? (
            <OrganisationExerciceReopenButton onClick={() => setReopenDialogOpen(true)} />
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-1.5"
            onClick={() => setImportDialogOpen(true)}
          >
            <Upload className="h-4 w-4" aria-hidden />
            Importer volumes
          </Button>
          {!loading && tree.stats.total > 0 && (
            <div className="flex gap-1.5 text-xs shrink-0">
              <span className="rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/70 px-2.5 py-0.5 tabular-nums">
                {tree.stats.actifs} actif{tree.stats.actifs > 1 ? "s" : ""}
              </span>
              <span className="rounded-full bg-muted text-muted-foreground border px-2.5 py-0.5 tabular-nums">
                {tree.stats.desinscrits} désinscrit{tree.stats.desinscrits > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </div>

      {missingSelfContact && (
        <Card className="border-amber-200/80 bg-amber-50/40">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Fiche contact introuvable</CardTitle>
            <CardDescription>
              Votre prénom et nom (Paramètres → Profil) doivent correspondre à une fiche
              contact pour ancrer l&apos;arbre. L&apos;import Mon Organisation depuis
              Contacts peut aussi peupler le réseau.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {onNavigate && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="gap-1.5"
                onClick={() =>
                  requestOpenParametres("profil", {
                    setCurrentPage: onNavigate,
                    currentPage: "organisation",
                  })
                }
              >
                <Settings className="h-4 w-4" />
                Ouvrir Paramètres
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      <div className="-mx-3 sm:-mx-4">
        <Card className="overflow-visible border-x-0 sm:border-x rounded-none sm:rounded-lg shadow-sm">
          <CardHeader className="border-b bg-muted/20 py-3 px-4 sm:px-6 space-y-0">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users2 className="h-4 w-4 text-primary" aria-hidden />
                  Filleuls et parrains
                </CardTitle>
                <CardDescription className="text-xs mt-1">
                  {networkView === "pilotage"
                    ? "Liste hiérarchique · clic = dossier réseau · recherche = aller au membre"
                    : "Carte relationnelle · molette = zoom · glisser le fond · niveau 5+ repliées"}
                  {historyLoading ? " · chargement historique…" : null}
                </CardDescription>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {!loading && tree.stats.total > 0 && (
                  <span className="text-[11px] text-muted-foreground tabular-nums">
                    {tree.stats.actifs} actif{tree.stats.actifs > 1 ? "s" : ""}
                    {tree.stats.desinscrits > 0 &&
                      ` · ${tree.stats.desinscrits} désinscrit${tree.stats.desinscrits > 1 ? "s" : ""}`}
                  </span>
                )}
                <Tabs
                  value={networkView}
                  onValueChange={(value) => setNetworkView(value as "pilotage" | "carte")}
                >
                  <TabsList className="h-8">
                    <TabsTrigger value="pilotage" className="gap-1.5 text-xs px-2.5">
                      <ListTree className="h-3.5 w-3.5" aria-hidden />
                      Pilotage
                    </TabsTrigger>
                    <TabsTrigger value="carte" className="gap-1.5 text-xs px-2.5">
                      <Network className="h-3.5 w-3.5" aria-hidden />
                      Carte
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0 overflow-visible">
            {loading ? (
              <p className="text-sm text-muted-foreground p-6 text-center">Chargement…</p>
            ) : tree.selfContact && tree.stats.total === 0 && tree.upline.length === 0 ? (
              <p className="text-sm text-muted-foreground p-8 text-center">
                Aucun filleul ni parrain enregistré pour le moment.
              </p>
            ) : (
              <>
                {networkView === "pilotage" ? (
                  <OrganisationHierarchyList
                    tree={tree}
                    contacts={contacts}
                    volumeRows={volumeRows}
                    dossiersByContactId={dossiersByContactId}
                    treeVisibilityOptions={treeVisibilityOptions}
                    hideDesinscrits={hideDesinscritsInTree}
                    desinscritCountInExercice={tree.stats.desinscrits}
                    onHideDesinscritsChange={setHideDesinscritsInTree}
                    selectedContactId={selectedDossierContactId ?? activeContactId}
                    focusContactId={focusContactId}
                    onFocusContactHandled={() => setFocusContactId(null)}
                    onSelect={handleNodeClick}
                  />
                ) : (
                  <OrganisationTreeView
                    ref={treeViewportRef}
                    tree={tree}
                    contacts={contacts}
                    dossiersByContactId={dossiersByContactId}
                    treeVisibilityOptions={treeVisibilityOptions}
                    hideDesinscrits={hideDesinscritsInTree}
                    desinscritCountInExercice={tree.stats.desinscrits}
                    onHideDesinscritsChange={setHideDesinscritsInTree}
                    onNodeClick={handleNodeClick}
                    onParrainClick={handleParrainClick}
                    onRankSave={handleRankSave}
                    selectedContactId={selectedDossierContactId ?? activeContactId}
                    showBranchVolumesPanel={false}
                  />
                )}
              </>
            )}
          </CardContent>
        </Card>
      </div>

      {showBranchVolumesPanel && (
        <Card className="overflow-hidden">
          <CardContent className="p-0">
            <OrganisationBranchVolumesPanel
              rows={volumeRows}
              contacts={contacts}
              readOnly={selectedExerciceClosed}
              liveMode={viewingLiveVolumes}
              exerciceLabel={resolvedExerciceLabel}
              onVolumeSave={
                selectedExerciceClosed
                  ? async () => {}
                  : viewingLiveVolumes
                    ? handleVolumeSave
                    : handleHistoricalVolumeSave
              }
              onManagerVolumeSave={
                viewingLiveVolumes && !selectedExerciceClosed
                  ? handleManagerVolumeSave
                  : async () => {}
              }
              onBranchVolumeSave={
                !viewingLiveVolumes && !selectedExerciceClosed
                  ? handleHistoricalBranchVolumeSave
                  : undefined
              }
              onNodeClick={handleNodeClick}
              showTopBorder={false}
            />
          </CardContent>
        </Card>
      )}

      <OrganisationMemberDossierPanel
        contactId={selectedDossierContactId}
        roster={searchRoster}
        contacts={contacts}
        cgp={cgp}
        canEditVolumes={!currentExerciceClosed}
        refreshKey={dataRevision}
        dossier={
          selectedDossierContactId != null
            ? mergeLegacyFilleulDossierView(
                contacts.find((c) => c.id === selectedDossierContactId) ?? {
                  id: selectedDossierContactId,
                },
                dossiersByContactId.get(selectedDossierContactId)
              )
            : null
        }
        onDossierChange={handleDossierChange}
        onNetworkDataChange={handleNetworkDataChange}
        onClose={() => setSelectedDossierContactId(null)}
        onSelectMember={(contactId) => {
          setSelectedDossierContactId(contactId);
          setFocusContactId(contactId);
        }}
        onFocusInTree={handleFocusInTree}
        onOpenContactSheet={handleOpenContactSheet}
        onVolumeSave={handleVolumeSave}
        onManagerVolumeSave={handleManagerVolumeSave}
        onRankSave={handleRankSave}
        stackedContactOpen={contactDetailOpen}
      />

      <OrganisationExerciceCloseDialog
        open={closeDialogOpen}
        onOpenChange={setCloseDialogOpen}
        exerciceLabel={resolvedExerciceLabel}
        snapshots={closeSnapshots}
        allowResetOwnVolumes={closeDialogAllowResetOwnVolumes}
        onClosed={() => {
          if (viewingLiveVolumes) {
            setSelectedExercice(ORGANISATION_CURRENT_EXERCICE);
          }
          void loadData();
        }}
      />

      <OrganisationExerciceReopenDialog
        open={reopenDialogOpen}
        onOpenChange={setReopenDialogOpen}
        exerciceLabel={resolvedExerciceLabel}
        snapshotCount={reopenSnapshotCount}
        allowRestoreOwnVolumes={reopenDialogAllowRestoreOwnVolumes}
        onReopened={() => {
          if (reopenDialogAllowRestoreOwnVolumes) {
            setSelectedExercice(ORGANISATION_CURRENT_EXERCICE);
          }
          void loadData();
        }}
      />

      <OrganisationVolumesImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onApplied={() => void loadData()}
      />

      {contactDetailSheet}
    </div>
  );
}
