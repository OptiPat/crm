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
import { buildOrganisationVolumeRows } from "@/lib/organisation/organisation-branch-volumes";
import {
  buildOrganisationVolumeRowsForExercice,
  indexFilleulVolumeExercicesByContactId,
  isCurrentOrganisationExercice,
  resolveOrganisationExerciceLabel,
  type OrganisationExerciceSelection,
} from "@/lib/organisation/organisation-volume-history";
import {
  exerciceIsClosed,
  getFilleulVolumeExercicesByLabel,
  listFilleulVolumeExerciceLabels,
} from "@/lib/api/tauri-filleul-volumes";
import { currentFiscalYearLabel } from "@/lib/pipe/remuneration-fiscal-year";
import { OrganisationVolumesImportDialog } from "@/components/organisation/OrganisationVolumesImportDialog";
import { OrganisationMemberSearch } from "@/components/organisation/OrganisationMemberSearch";
import { OrganisationMemberDossierPanel } from "@/components/organisation/OrganisationMemberDossierPanel";
import { OrganisationHierarchyList } from "@/components/organisation/OrganisationHierarchyList";
import { collectOrganisationMemberRoster } from "@/lib/organisation/organisation-member-roster";
import {
  collectOrganisationMemberContactIds,
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
  const [closedLabels, setClosedLabels] = useState<string[]>([]);
  const [selectedExercice, setSelectedExercice] =
    useState<OrganisationExerciceSelection>(ORGANISATION_CURRENT_EXERCICE);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyRecords, setHistoryRecords] = useState<
    Awaited<ReturnType<typeof getFilleulVolumeExercicesByLabel>>
  >([]);
  const [closeDialogOpen, setCloseDialogOpen] = useState(false);
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
      const [loadedContacts, loadedCgp, labels] = await Promise.all([
        getAllContacts(),
        getCgpConfig(),
        listFilleulVolumeExerciceLabels(),
      ]);
      setContacts(loadedContacts);
      setCgp(loadedCgp);
      setClosedLabels(labels);
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

  const tree = useMemo(
    () => buildOrganisationTree(contacts, cgp ?? {}),
    [contacts, cgp]
  );

  const resolvedExerciceLabel = useMemo(
    () => resolveOrganisationExerciceLabel(selectedExercice),
    [selectedExercice]
  );

  const viewingCurrentExercice = useMemo(
    () =>
      isCurrentOrganisationExercice(selectedExercice) ||
      (selectedExercice === currentFiscalYearLabel() && !closedLabels.includes(selectedExercice)),
    [selectedExercice, closedLabels]
  );

  useEffect(() => {
    let cancelled = false;
    const loadHistory = async () => {
      if (viewingCurrentExercice) {
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
  }, [resolvedExerciceLabel, viewingCurrentExercice]);

  const volumeRows = useMemo(() => {
    if (viewingCurrentExercice) {
      return buildOrganisationVolumeRows(tree, contacts);
    }
    if (historyRecords.length === 0) return [];
    return buildOrganisationVolumeRowsForExercice(tree, contacts, {
      mode: "history",
      recordsByContactId: indexFilleulVolumeExercicesByContactId(historyRecords),
    });
  }, [viewingCurrentExercice, tree, contacts, historyRecords]);

  const showBranchVolumesPanel =
    volumeRows.length > 0 &&
    (viewingCurrentExercice || (!historyLoading && historyRecords.length > 0));

  const memberRoster = useMemo(() => collectOrganisationMemberRoster(tree), [tree]);

  useEffect(() => {
    let cancelled = false;
    const ids = collectOrganisationMemberContactIds(memberRoster);
    if (ids.length === 0) {
      setDossiersByContactId(new Map());
      return;
    }
    void getFilleulDossiersByContactIds(ids)
      .then((rows) => {
        if (!cancelled) setDossiersByContactId(indexFilleulDossiersByContactId(rows));
      })
      .catch((error) => {
        console.error(error);
        if (!cancelled) toast.error("Impossible de charger les dossiers réseau");
      });
    return () => {
      cancelled = true;
    };
  }, [memberRoster, dataRevision]);

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

  const missingSelfContact = !loading && tree.selfContact == null;
  const showHistoryEmpty =
    !loading && !historyLoading && !viewingCurrentExercice && historyRecords.length === 0;
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
            roster={memberRoster}
            onSelect={handleMemberSelect}
          />
          <OrganisationExerciceSelector
            closedLabels={closedLabels}
            value={selectedExercice}
            onValueChange={setSelectedExercice}
          />
          {viewingCurrentExercice && !currentExerciceClosed && tree.stats.total > 0 ? (
            <OrganisationExerciceCloseButton onClick={() => setCloseDialogOpen(true)} />
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

      {showHistoryEmpty && (
        <Card className="border-dashed">
          <CardContent className="py-6 text-sm text-muted-foreground text-center">
            Aucun snapshot pour l&apos;exercice {resolvedExerciceLabel}. Clôturez l&apos;exercice
            ou importez les volumes historiques pour le consulter ici.
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
            ) : tree.selfContact &&
              tree.generations.length === 0 &&
              tree.upline.length === 0 &&
              tree.desinscrits.length === 0 ? (
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
              readOnly={!viewingCurrentExercice}
              exerciceLabel={resolvedExerciceLabel}
              onVolumeSave={viewingCurrentExercice ? handleVolumeSave : async () => {}}
              onManagerVolumeSave={
                viewingCurrentExercice ? handleManagerVolumeSave : async () => {}
              }
              onNodeClick={handleNodeClick}
              showTopBorder={false}
            />
          </CardContent>
        </Card>
      )}

      <OrganisationMemberDossierPanel
        contactId={selectedDossierContactId}
        roster={memberRoster}
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
        tree={tree}
        contacts={contacts}
        onClosed={() => {
          setSelectedExercice(ORGANISATION_CURRENT_EXERCICE);
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
