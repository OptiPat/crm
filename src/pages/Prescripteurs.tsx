import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
import { Plus, Pencil, UserPlus, Link2 } from "lucide-react";
import {
  getAllContacts,
  deleteContact,
  updateContact,
  type Contact,
} from "@/lib/api/tauri-contacts";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { ContactForm } from "@/components/contacts/ContactForm";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { getAllInvestissements, type Investissement } from "@/lib/api/tauri-investissements";
import { indexInvestissementsByOwner } from "@/lib/investissements/bulk-patrimoine";
import {
  buildFoyersInfo,
  buildPrescripteurTree,
  computePrescripteursRacines,
  countDirectClientsForPrescripteur,
  type PrescripteurStats,
} from "@/lib/prescripteurs/prescripteur-tree";
import { collectAllTreeContactIds } from "@/lib/prescripteurs/prescripteur-tree-nav";
import {
  expandPathForContact,
  filterPrescripteurRootsByStat,
  findPrescripteurRacineId,
  getPrescripteurRacineIds,
  searchPrescripteurRoots,
  sortPrescripteurRoots,
} from "@/lib/prescripteurs/prescripteur-search";
import {
  loadPrescripteursPagePreferences,
  savePrescripteursPagePreferences,
  type PrescripteursPagePreferences,
} from "@/lib/prescripteurs/prescripteurs-page-preferences";
import { downloadPrescripteurNetworkCsv } from "@/lib/prescripteurs/prescripteurs-export";
import {
  consumePrescripteursNavigationIntent,
  type PrescripteursNavigationIntent,
} from "@/lib/navigation/prescripteurs-navigation";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { PrescripteurSummaryCard } from "@/components/prescripteurs/PrescripteurSummaryCard";
import { PrescripteurTreeView } from "@/components/prescripteurs/PrescripteurTreeView";
import { PrescripteurLinkModal } from "@/components/prescripteurs/PrescripteurLinkModal";
import {
  PrescripteursPageHelp,
  PrescripteursStatCards,
  PrescripteursToolbar,
} from "@/components/prescripteurs/prescripteurs-page-ui";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

type PrescripteursProps = {
  onNavigate?: (page: string) => void;
};

export function Prescripteurs({ onNavigate }: PrescripteursProps) {
  const [prefs, setPrefs] = useState<PrescripteursPagePreferences>(() =>
    loadPrescripteursPagePreferences()
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [investissementsByContact, setInvestissementsByContact] = useState<
    Record<number, Investissement[]>
  >({});
  const [investissementsByFoyer, setInvestissementsByFoyer] = useState<
    Record<number, Investissement[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [expandedPrescripteurs, setExpandedPrescripteurs] = useState<Set<number>>(new Set());
  const [expandedInvestissements, setExpandedInvestissements] = useState<Set<number>>(
    new Set()
  );
  const [showPrescripteurForm, setShowPrescripteurForm] = useState(false);
  const [showClientRecommandeForm, setShowClientRecommandeForm] = useState(false);
  const [showLinkClientModal, setShowLinkClientModal] = useState(false);
  const [actionPrescripteur, setActionPrescripteur] = useState<Contact | null>(null);
  const [expandedPrescripteurId, setExpandedPrescripteurId] = useState<number | null>(
    () => loadPrescripteursPagePreferences().selectedPrescripteurId
  );
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDetail, setShowContactDetail] = useState(false);
  const [highlightContactId, setHighlightContactId] = useState<number | null>(null);
  const [pendingRootDelete, setPendingRootDelete] = useState<Contact | null>(null);
  const pendingFocusContactIdRef = useRef<number | null>(null);

  const updatePrefs = useCallback((patch: Partial<PrescripteursPagePreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePrescripteursPagePreferences(next);
      return next;
    });
  }, []);

  const loadData = useCallback(async () => {
    try {
      const dataContacts = await getAllContacts();
      setContacts(dataContacts);

      const allInv = await getAllInvestissements();
      const { byContactId, byFoyerId } = indexInvestissementsByOwner(allInv);
      const investsByContact: Record<number, Investissement[]> = {};
      const investsByFoyer: Record<number, Investissement[]> = {};
      for (const contact of dataContacts) {
        investsByContact[contact.id] = byContactId[contact.id] ?? [];
      }
      for (const contact of dataContacts) {
        if (contact.foyer_id != null && investsByFoyer[contact.foyer_id] == null) {
          investsByFoyer[contact.foyer_id] = byFoyerId[contact.foyer_id] ?? [];
        }
      }

      setInvestissementsByContact(investsByContact);
      setInvestissementsByFoyer(investsByFoyer);
      setSelectedContact((prev) => {
        if (!prev?.id) return prev;
        return dataContacts.find((c) => c.id === prev.id) ?? prev;
      });
      setExpandedPrescripteurId((prev) => {
        if (prev == null) return prev;
        return dataContacts.some((c) => c.id === prev) ? prev : null;
      });
    } catch (error) {
      console.error("Erreur chargement données:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEventAutoRefresh(loadData, subscribeContactsChanged);

  const applyPrescripteursIntent = useCallback(
    (intent: PrescripteursNavigationIntent) => {
      if (intent.rootId != null) {
        setExpandedPrescripteurId(intent.rootId);
        updatePrefs({ selectedPrescripteurId: intent.rootId });
      }
      if (intent.focusContactId != null) {
        setHighlightContactId(intent.focusContactId);
        pendingFocusContactIdRef.current = intent.focusContactId;
        setSelectedContact(null);
        setShowContactDetail(false);
      }
    },
    [updatePrefs]
  );

  useEffect(() => {
    applyPrescripteursIntent(consumePrescripteursNavigationIntent());
  }, [applyPrescripteursIntent]);

  useAppNavigationListener((detail) => {
    if (detail.type === "prescripteurs") {
      applyPrescripteursIntent({
        rootId: detail.rootId,
        focusContactId: detail.focusContactId,
      });
      return;
    }
    if (detail.type === "page" && detail.page === "prescripteurs") {
      applyPrescripteursIntent(consumePrescripteursNavigationIntent());
    }
  }, [applyPrescripteursIntent]);

  const foyersInfo = useMemo(() => buildFoyersInfo(contacts), [contacts]);

  const prescripteursRacines = useMemo(
    () =>
      computePrescripteursRacines(
        contacts,
        investissementsByContact,
        investissementsByFoyer
      ),
    [contacts, investissementsByContact, investissementsByFoyer]
  );

  useEffect(() => {
    if (pendingFocusContactIdRef.current == null || contacts.length === 0) return;
    if (prescripteursRacines.length === 0) return;
    const focusId = pendingFocusContactIdRef.current;
    pendingFocusContactIdRef.current = null;
    const racineIds = getPrescripteurRacineIds(prescripteursRacines);
    const rootId = findPrescripteurRacineId(focusId, contacts, racineIds);
    if (rootId != null) {
      setExpandedPrescripteurId(rootId);
      updatePrefs({ selectedPrescripteurId: rootId });
    }
  }, [contacts, prescripteursRacines, updatePrefs]);

  const { filteredPrescripteurs, searchFocusId } = useMemo(() => {
    const searched = searchPrescripteurRoots(
      prefs.searchQuery,
      prescripteursRacines,
      contacts,
      foyersInfo
    );
    const statFilter = prefs.statFilter ?? "all";
    const filtered = sortPrescripteurRoots(
      filterPrescripteurRootsByStat(searched.roots, statFilter),
      prefs.sortId,
      foyersInfo
    );
    return {
      filteredPrescripteurs: filtered,
      searchFocusId: searched.focusContactId,
    };
  }, [prescripteursRacines, contacts, foyersInfo, prefs]);

  const effectiveHighlightId = prefs.searchQuery.trim()
    ? (searchFocusId ?? highlightContactId)
    : (highlightContactId ?? searchFocusId);

  const expandedIsVisible =
    expandedPrescripteurId != null &&
    filteredPrescripteurs.some((p) => p.contact.id === expandedPrescripteurId);

  useEffect(() => {
    if (searchFocusId == null || !prefs.searchQuery.trim()) return;
    const racineIds = getPrescripteurRacineIds(prescripteursRacines);
    const rootId = findPrescripteurRacineId(searchFocusId, contacts, racineIds);
    if (rootId != null) {
      setExpandedPrescripteurId(rootId);
    }
  }, [searchFocusId, prefs.searchQuery, contacts, prescripteursRacines]);

  const expandedStats = useMemo(
    () =>
      expandedPrescripteurId != null
        ? (prescripteursRacines.find((p) => p.contact.id === expandedPrescripteurId) ??
          null)
        : null,
    [prescripteursRacines, expandedPrescripteurId]
  );

  const treeContext = useMemo(
    () => ({
      contacts,
      investissementsByContact,
      investissementsByFoyer,
      foyersInfo,
    }),
    [contacts, investissementsByContact, investissementsByFoyer, foyersInfo]
  );

  const expandedTree = useMemo(() => {
    if (!expandedStats) return null;
    return buildPrescripteurTree(expandedStats.contact, treeContext);
  }, [expandedStats, treeContext]);

  useEffect(() => {
    if (!expandedTree || expandedPrescripteurId == null) return;
    const focusId = effectiveHighlightId;
    if (focusId != null) {
      const path = expandPathForContact(expandedTree, focusId);
      setExpandedPrescripteurs(new Set(path));
    } else {
      setExpandedPrescripteurs(new Set([expandedPrescripteurId]));
    }
  }, [expandedTree, effectiveHighlightId, expandedPrescripteurId]);

  useEffect(() => {
    if (loading || prescripteursRacines.length === 0) return;
    if (
      expandedPrescripteurId != null &&
      prescripteursRacines.some((p) => p.contact.id === expandedPrescripteurId)
    ) {
      return;
    }
    const savedId = prefs.selectedPrescripteurId;
    if (savedId != null && prescripteursRacines.some((p) => p.contact.id === savedId)) {
      setExpandedPrescripteurId(savedId);
    }
  }, [loading, prescripteursRacines, expandedPrescripteurId, prefs.selectedPrescripteurId]);

  const totalPatrimoineApporte = prescripteursRacines.reduce(
    (sum, p) => sum + p.patrimoineApporteTotal,
    0
  );
  const rootsWithClients = prescripteursRacines.filter((p) => p.nombreClientsTotal > 0).length;
  const rootsWithoutClients = prescripteursRacines.length - rootsWithClients;

  const toggleExpand = (id: number) => {
    setExpandedPrescripteurs((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleInvestissements = (id: number) => {
    setExpandedInvestissements((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const togglePrescripteurTree = (stats: PrescripteurStats) => {
    const id = stats.contact.id;
    setExpandedPrescripteurId((prev) => {
      const next = prev === id ? null : id;
      updatePrefs({ selectedPrescripteurId: next });
      return next;
    });
    setExpandedPrescripteurs(new Set([id]));
  };

  const openPrescripteur = (stats: PrescripteurStats) => {
    setExpandedPrescripteurId(stats.contact.id);
    updatePrefs({ selectedPrescripteurId: stats.contact.id });
    setExpandedPrescripteurs(new Set([stats.contact.id]));
  };

  const openMember = (contact: Contact) => {
    setSelectedContact(contact);
    setShowContactDetail(true);
  };

  const expandAllInTree = () => {
    if (!expandedTree) return;
    setExpandedPrescripteurs(new Set(collectAllTreeContactIds(expandedTree)));
  };

  const collapseTree = () => {
    if (expandedPrescripteurId == null) return;
    setExpandedPrescripteurs(new Set([expandedPrescripteurId]));
  };

  const prescripteurForModals = actionPrescripteur ?? expandedStats?.contact ?? null;

  const openAddClientFor = (contact: Contact) => {
    setActionPrescripteur(contact);
    setShowClientRecommandeForm(true);
  };

  const openLinkClientFor = (contact: Contact) => {
    setActionPrescripteur(contact);
    setShowLinkClientModal(true);
  };

  const renderPrescripteurActions = (contact: Contact) => (
    <div className="flex flex-wrap gap-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => openMember(contact)}
      >
        <Pencil className="h-3.5 w-3.5" />
        Modifier
      </Button>
      <Button
        type="button"
        size="sm"
        className="gap-1.5"
        onClick={() => openAddClientFor(contact)}
      >
        <UserPlus className="h-3.5 w-3.5" />
        Nouveau client recommandé
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5"
        onClick={() => openLinkClientFor(contact)}
      >
        <Link2 className="h-3.5 w-3.5" />
        Lier un contact existant
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="gap-1.5 text-destructive hover:text-destructive"
        onClick={() => setPendingRootDelete(contact)}
      >
        Supprimer
      </Button>
    </div>
  );

  const executeDeleteContact = async (contact: Contact) => {
    try {
      await deleteContact(contact.id);
      if (expandedPrescripteurId === contact.id) {
        setExpandedPrescripteurId(null);
        updatePrefs({ selectedPrescripteurId: null });
      }
      if (selectedContact?.id === contact.id) {
        setSelectedContact(null);
        setShowContactDetail(false);
      }
      await loadData();
      toast.success("Contact supprimé");
    } catch (error) {
      console.error("Erreur suppression contact:", error);
      toast.error("Erreur lors de la suppression");
    }
  };

  const handleDeleteContact = async (contact: Contact) => {
    await executeDeleteContact(contact);
  };

  const handleDeleteContactById = (id: number) => {
    const match =
      contacts.find((c) => c.id === id) ??
      (selectedContact?.id === id ? selectedContact : null);
    if (match) {
      void executeDeleteContact(match);
    }
  };

  const handleUnlinkFromNetwork = async (contact: Contact) => {
    try {
      await updateContact(
        contact.id,
        contactToUpdatePayload(contact, { prescripteur_id: undefined })
      );
      if (highlightContactId === contact.id) {
        setHighlightContactId(null);
      }
      await loadData();
      toast.success("Contact retiré du réseau");
    } catch (error) {
      console.error("Erreur retrait réseau:", error);
      toast.error("Impossible de retirer du réseau");
    }
  };

  const today = new Intl.DateTimeFormat("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date());

  if (loading) {
    return (
      <div className="space-y-6 max-w-[1600px] mx-auto pb-8 animate-pulse">
        <div className="h-20 rounded-lg bg-muted/50" />
        <div className="grid gap-3 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/50" />
          ))}
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-20 rounded-xl bg-muted/50" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-[1600px] mx-auto pb-8">
      <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border/60 pb-6">
        <div>
          <p className="text-xs font-medium text-muted-foreground capitalize">{today}</p>
          <h2 className="text-3xl font-serif font-bold text-primary tracking-tight mt-1">
            Prescripteurs
          </h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Réseaux de recommandations —{" "}
            <span className="tabular-nums text-foreground/80">
              {filteredPrescripteurs.length} racine
              {filteredPrescripteurs.length !== 1 ? "s" : ""}
            </span>
            {prefs.searchQuery.trim() ? " (recherche active)" : ""}
          </p>
        </div>
        <Button className="gap-2 shadow-sm" onClick={() => setShowPrescripteurForm(true)}>
          <Plus className="h-4 w-4" />
          Nouveau prescripteur
        </Button>
      </header>

      <PrescripteursPageHelp />

      <PrescripteursStatCards
        racineCount={prescripteursRacines.length}
        rootsWithClients={rootsWithClients}
        rootsWithoutClients={rootsWithoutClients}
        totalPatrimoineLabel={formatEuroCentimes(totalPatrimoineApporte)}
        activeFilter={prefs.statFilter}
        onFilterChange={(filter) => updatePrefs({ statFilter: filter })}
      />

      <PrescripteursToolbar
        searchQuery={prefs.searchQuery}
        onSearchChange={(searchQuery) => updatePrefs({ searchQuery })}
        sortId={prefs.sortId}
        onSortChange={(sortId) => updatePrefs({ sortId })}
        statFilter={prefs.statFilter}
        onClearStatFilter={() => updatePrefs({ statFilter: null })}
        onExpandAll={expandAllInTree}
        onCollapseAll={collapseTree}
        onExportCsv={
          expandedTree
            ? () => downloadPrescripteurNetworkCsv(expandedTree, foyersInfo)
            : undefined
        }
        showTreeControls={expandedIsVisible && expandedTree != null}
      />

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Liste des prescripteurs</CardTitle>
          <CardDescription>
            {prefs.searchQuery.trim()
              ? `${filteredPrescripteurs.length} résultat(s) dans le réseau`
              : "Cliquez sur une carte pour déplier son arbre"}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {filteredPrescripteurs.length === 0 ? (
            <div className="py-14 text-center rounded-xl border border-dashed border-border/80 bg-muted/15">
              <p className="font-medium text-foreground/90">Aucun prescripteur</p>
              <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
                {prefs.searchQuery.trim()
                  ? "Aucune racine ne correspond à cette recherche."
                  : "Créez un prescripteur ou assignez-en un depuis la fiche d'un client."}
              </p>
              {!prefs.searchQuery.trim() && (
                <Button className="gap-2" onClick={() => setShowPrescripteurForm(true)}>
                  <Plus className="h-4 w-4" />
                  Nouveau prescripteur
                </Button>
              )}
            </div>
          ) : (
            filteredPrescripteurs.map((prescripteur) => {
              const isExpanded = expandedPrescripteurId === prescripteur.contact.id;
              const tree = isExpanded
                ? buildPrescripteurTree(prescripteur.contact, treeContext)
                : null;

              return (
                <div
                  key={prescripteur.contact.id}
                  className={cn(
                    "rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm transition-shadow",
                    isExpanded && "ring-1 ring-primary/20"
                  )}
                >
                  <div className="p-1">
                    <PrescripteurSummaryCard
                      stats={prescripteur}
                      foyersInfo={foyersInfo}
                      selected={isExpanded}
                      onClick={() => togglePrescripteurTree(prescripteur)}
                      actionHint={isExpanded ? "Replier l'arbre" : "Voir le réseau"}
                    />
                  </div>

                  {isExpanded && tree && (
                    <div className="border-t border-border/60 bg-muted/15 px-4 py-4 space-y-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            Arbre · {prescripteur.nombreClientsTotal} client
                            {prescripteur.nombreClientsTotal !== 1 ? "s" : ""} ·{" "}
                            {formatEuroCentimes(prescripteur.patrimoineApporteTotal)} apporté
                          </p>
                        </div>
                        {renderPrescripteurActions(prescripteur.contact)}
                      </div>
                      <PrescripteurTreeView
                        root={tree}
                        foyersInfo={foyersInfo}
                        expandedNodes={expandedPrescripteurs}
                        expandedInvestissements={expandedInvestissements}
                        onToggleNode={toggleExpand}
                        onToggleInvestissements={toggleInvestissements}
                        onNodeClick={openMember}
                        onDeleteContact={handleDeleteContact}
                        onUnlinkFromNetwork={handleUnlinkFromNetwork}
                        onAddClientRecommande={openAddClientFor}
                        onLinkClient={openLinkClientFor}
                        highlightContactId={
                          expandedPrescripteurId === prescripteur.contact.id
                            ? (effectiveHighlightId ?? undefined)
                            : undefined
                        }
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <ContactForm
        open={showPrescripteurForm}
        onOpenChange={setShowPrescripteurForm}
        createContext="prescripteurs"
        onSuccess={() => void loadData()}
        onCreated={(created) => {
          void loadData();
          openPrescripteur({
            contact: created,
            nombreClientsTotal: 0,
            nombreClientsDirects: 0,
            patrimoineApporteTotal: 0,
            patrimoinePersonnel: 0,
          });
        }}
      />

      {prescripteurForModals && (
        <>
          <ContactForm
            open={showClientRecommandeForm}
            onOpenChange={setShowClientRecommandeForm}
            createContext="clients"
            defaultPrescripteurId={prescripteurForModals.id}
            onSuccess={() => void loadData()}
            onCreated={(created) => {
              void loadData();
              openMember(created);
            }}
          />
          <PrescripteurLinkModal
            open={showLinkClientModal}
            onOpenChange={setShowLinkClientModal}
            prescripteur={prescripteurForModals}
            onSuccess={() => void loadData()}
          />
        </>
      )}

      {selectedContact && (
        <ContactDetail
          key={selectedContact.id}
          open={showContactDetail}
          onOpenChange={(open) => {
            setShowContactDetail(open);
            if (!open) setSelectedContact(null);
          }}
          contact={selectedContact}
          onDelete={handleDeleteContactById}
          onUpdate={() => void loadData()}
          onContactRefreshed={setSelectedContact}
          onNavigate={onNavigate}
          onOpenContact={openMember}
        />
      )}

      <AlertDialog
        open={pendingRootDelete != null}
        onOpenChange={(open) => !open && setPendingRootDelete(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer ce prescripteur ?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {pendingRootDelete && (
                  <>
                    <p>
                      Supprimer{" "}
                      <strong>
                        {pendingRootDelete.prenom} {pendingRootDelete.nom}
                      </strong>{" "}
                      ?
                    </p>
                    {(() => {
                      const clientsOrphelins = contacts.filter(
                        (c) => c.prescripteur_id === pendingRootDelete.id
                      );
                      const clientsFoyer = countDirectClientsForPrescripteur(
                        pendingRootDelete,
                        contacts,
                        foyersInfo
                      );
                      if (clientsOrphelins.length > 0) {
                        return (
                          <p>
                            Attention : {clientsOrphelins.length} client(s) recommandé(s)
                            perdront leur lien prescripteur.
                          </p>
                        );
                      }
                      if (clientsFoyer > 0) {
                        return (
                          <p>
                            Ce foyer compte {clientsFoyer} client(s) recommandé(s) liés à un
                            autre membre — non affectés par cette suppression.
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => {
                if (pendingRootDelete) {
                  void executeDeleteContact(pendingRootDelete);
                }
                setPendingRootDelete(null);
              }}
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
