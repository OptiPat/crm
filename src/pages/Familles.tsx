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
import { Plus, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { getAllContacts, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import {
  getAllInvestissements,
  type Investissement,
} from "@/lib/api/tauri-investissements";
import { indexInvestissementsByOwner } from "@/lib/investissements/bulk-patrimoine";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { getAllFamilles } from "@/lib/api/tauri-familles";
import { buildFamilleGroups } from "@/lib/familles/build-famille-groups";
import type { FamilleGroup } from "@/lib/familles/famille-types";
import {
  deleteFamilleIfEmpty,
  promoteAutoFamilleToManual,
  removeContactFromFamille,
} from "@/lib/familles/famille-members";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import {
  coreMemberCount,
  filterFamilleGroupsByStat,
  findFamilleKeyForContact,
  searchFamilleGroups,
  sortFamilleGroups,
} from "@/lib/familles/familles-search";
import {
  loadFamillesPagePreferences,
  saveFamillesPagePreferences,
  type FamillesPagePreferences,
} from "@/lib/familles/familles-page-preferences";
import { useCanExport } from "@/components/team/TeamWorkspaceProvider";
import { assertCanExport } from "@/lib/export/assert-can-export";
import { downloadFamilleMembersCsv } from "@/lib/familles/familles-export";
import {
  consumeFamillesNavigationIntent,
  type FamillesNavigationIntent,
} from "@/lib/navigation/familles-navigation";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { FamilleMemberTree } from "@/components/familles/FamilleMemberTree";
import { FamilleSummaryCard } from "@/components/familles/FamilleSummaryCard";
import { FamilleCreateModal } from "@/components/familles/FamilleCreateModal";
import { FamilleAddMemberModal } from "@/components/familles/FamilleAddMemberModal";
import {
  FamillesPageHelp,
  FamillesStatCards,
  FamillesToolbar,
} from "@/components/familles/familles-page-ui";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { cn } from "@/lib/utils";

type FamillesProps = {
  onNavigate?: (page: string) => void;
};

type PendingMemberAction =
  | { type: "remove_manual"; contact: Contact; famille: FamilleGroup }
  | { type: "exclude_auto"; contact: Contact };

export function Familles({ onNavigate }: FamillesProps) {
  const canExport = useCanExport();
  const [prefs, setPrefs] = useState<FamillesPagePreferences>(() =>
    loadFamillesPagePreferences()
  );
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [investissementsByContact, setInvestissementsByContact] = useState<
    Record<number, Investissement[]>
  >({});
  const [investissementsByFoyer, setInvestissementsByFoyer] = useState<
    Record<number, Investissement[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [famillesDb, setFamillesDb] = useState<Awaited<ReturnType<typeof getAllFamilles>>>([]);
  const [expandedFamilleKey, setExpandedFamilleKey] = useState<string | null>(
    () => loadFamillesPagePreferences().expandedFamilleKey
  );
  const [highlightContactId, setHighlightContactId] = useState<number | null>(null);
  const [showCreateFamilleModal, setShowCreateFamilleModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [addMemberFamille, setAddMemberFamille] = useState<FamilleGroup | null>(null);
  const [addMemberLoading, setAddMemberLoading] = useState(false);
  const [pendingMemberAction, setPendingMemberAction] =
    useState<PendingMemberAction | null>(null);
  const pendingFocusContactIdRef = useRef<number | null>(null);

  const updatePrefs = useCallback((patch: Partial<FamillesPagePreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveFamillesPagePreferences(next);
      return next;
    });
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [dataContacts, dataFoyers, dataFamilles] = await Promise.all([
        getAllContacts(),
        getAllFoyers(),
        getAllFamilles(),
      ]);
      setContacts(dataContacts);
      setFoyers(dataFoyers);
      setFamillesDb(dataFamilles);

      const allInv = await getAllInvestissements();
      const { byContactId, byFoyerId } = indexInvestissementsByOwner(allInv);
      const investsByContact: Record<number, Investissement[]> = {};
      const investsByFoyer: Record<number, Investissement[]> = {};
      for (const contact of dataContacts) {
        investsByContact[contact.id] = byContactId[contact.id] ?? [];
      }
      for (const foyer of dataFoyers) {
        investsByFoyer[foyer.id] = byFoyerId[foyer.id] ?? [];
      }

      setInvestissementsByContact(investsByContact);
      setInvestissementsByFoyer(investsByFoyer);
    } catch (error) {
      console.error("Erreur chargement familles:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEventAutoRefresh(
    loadData,
    subscribeContactsChanged,
    subscribeFoyersChanged,
    subscribeInvestissementsChanged
  );

  const {
    openContactSheet,
    closeContactDetail,
    refreshOpenContact,
    sheet: contactDetailSheet,
  } = useContactDetailSheet({
    onNavigate,
    onUpdate: () => void loadData(),
  });

  const familleGroups = useMemo(
    () =>
      buildFamilleGroups(
        contacts,
        foyers,
        famillesDb,
        investissementsByContact,
        investissementsByFoyer
      ),
    [contacts, foyers, famillesDb, investissementsByContact, investissementsByFoyer]
  );

  const setExpandedKey = useCallback(
    (key: string | null) => {
      setExpandedFamilleKey(key);
      updatePrefs({ expandedFamilleKey: key });
    },
    [updatePrefs]
  );

  const applyFamillesIntent = useCallback(
    (intent: FamillesNavigationIntent) => {
      if (intent.familleKey != null) {
        setExpandedKey(intent.familleKey);
      }
      if (intent.focusContactId != null) {
        updatePrefs({ searchQuery: "" });
        setHighlightContactId(intent.focusContactId);
        pendingFocusContactIdRef.current = intent.focusContactId;
        closeContactDetail();
      }
    },
    [setExpandedKey, updatePrefs, closeContactDetail]
  );

  useEffect(() => {
    applyFamillesIntent(consumeFamillesNavigationIntent());
  }, [applyFamillesIntent]);

  useAppNavigationListener((detail) => {
    if (detail.type === "familles") {
      applyFamillesIntent({
        familleKey: detail.familleKey,
        focusContactId: detail.focusContactId,
      });
      return;
    }
    if (detail.type === "page" && detail.page === "familles") {
      applyFamillesIntent(consumeFamillesNavigationIntent());
    }
  }, [applyFamillesIntent]);

  useEffect(() => {
    if (pendingFocusContactIdRef.current == null || familleGroups.length === 0) return;
    const focusId = pendingFocusContactIdRef.current;
    pendingFocusContactIdRef.current = null;
    const key = findFamilleKeyForContact(focusId, familleGroups);
    if (key != null) {
      setExpandedKey(key);
    }
  }, [familleGroups, setExpandedKey]);

  const filteredFamilles = useMemo(() => {
    const searched = searchFamilleGroups(prefs.searchQuery, familleGroups);
    const statFilter = prefs.statFilter ?? "all";
    return sortFamilleGroups(
      filterFamilleGroupsByStat(searched.groups, statFilter),
      prefs.sortId
    );
  }, [familleGroups, prefs]);

  useEffect(() => {
    if (loading || expandedFamilleKey == null) return;
    if (familleGroups.some((g) => g.key === expandedFamilleKey)) return;

    // Après promotion auto→manuelle, le groupe peut ne pas être recalculé tout de suite.
    if (expandedFamilleKey.startsWith("manual:")) {
      const id = parseInt(expandedFamilleKey.slice("manual:".length), 10);
      if (Number.isFinite(id) && famillesDb.some((f) => f.id === id)) {
        return;
      }
    }

    setExpandedKey(null);
  }, [loading, familleGroups, expandedFamilleKey, famillesDb, setExpandedKey]);

  const expandedFamille = useMemo(
    () =>
      expandedFamilleKey != null
        ? (familleGroups.find((g) => g.key === expandedFamilleKey) ?? null)
        : null,
    [familleGroups, expandedFamilleKey]
  );

  const expandedIsVisible =
    expandedFamilleKey != null &&
    filteredFamilles.some((g) => g.key === expandedFamilleKey);

  const excludedHomonyms = useMemo(
    () => contacts.filter((c) => c.famille_regroupement_exclu),
    [contacts]
  );

  const totalPatrimoineAvecMoi = useMemo(
    () => familleGroups.reduce((s, f) => s + f.patrimoineAvecMoi, 0),
    [familleGroups]
  );

  const manualCount = familleGroups.filter((g) => g.isManual).length;
  const autoCount = familleGroups.filter((g) => !g.isManual).length;
  const withFoyerCount = familleGroups.filter((g) => g.foyers.length > 0).length;

  const toggleFamille = (famille: FamilleGroup) => {
    const next = expandedFamilleKey === famille.key ? null : famille.key;
    setExpandedKey(next);
  };

  const openMember = (contact: Contact) => {
    if (contact.id == null) return;
    void openContactSheet(contact.id);
  };

  const handleAddMemberClick = async (famille: FamilleGroup) => {
    if (addMemberLoading) return;
    if (famille.familleId != null) {
      setAddMemberFamille(famille);
      setShowAddMemberModal(true);
      return;
    }
    setAddMemberLoading(true);
    try {
      const familleId = await promoteAutoFamilleToManual(famille);
      await loadData();
      const key = `manual:${familleId}`;
      const promoted: FamilleGroup = {
        ...famille,
        key,
        familleId,
        isManual: true,
      };
      setExpandedKey(key);
      setAddMemberFamille(promoted);
      setShowAddMemberModal(true);
      toast.success(
        `Famille ${famille.nom} : les membres actuels sont conservés, vous pouvez en ajouter d'autres.`
      );
    } catch (error) {
      console.error("Erreur conversion famille:", error);
      toast.error("Impossible de préparer l'ajout de membre");
    } finally {
      setAddMemberLoading(false);
    }
  };

  const handleRoleFamilleChange = async (contact: Contact, newRole: string) => {
    try {
      await updateContact(
        contact.id,
        contactToUpdatePayload(contact, { role_famille: newRole })
      );
      setContacts((prev) =>
        prev.map((c) =>
          c.id === contact.id ? { ...c, role_famille: newRole } : c
        )
      );
      refreshOpenContact({ ...contact, role_famille: newRole });
    } catch (error) {
      console.error("Erreur mise à jour rôle famille:", error);
      toast.error("Impossible de mettre à jour le rôle famille");
    }
  };

  const executeRemoveFromManualFamille = async (
    contact: Contact,
    famille: FamilleGroup
  ) => {
    try {
      await removeContactFromFamille(contact);
      const nextContacts = contacts.map((c) =>
        c.id === contact.id ? { ...c, famille_id: null } : c
      );
      if (famille.familleId != null) {
        await deleteFamilleIfEmpty(famille.familleId, nextContacts);
        const stillHasMembers = nextContacts.some(
          (c) => c.famille_id === famille.familleId
        );
        if (!stillHasMembers) {
          setExpandedKey(null);
        }
      }
      await loadData();
      toast.success(`${contact.prenom} ${contact.nom} retiré de la famille`);
    } catch (error) {
      console.error("Erreur retrait membre famille:", error);
      toast.error("Impossible de retirer ce membre");
    }
  };

  const executeExcludeFromFamille = async (contact: Contact) => {
    try {
      await updateContact(
        contact.id,
        contactToUpdatePayload(contact, { famille_regroupement_exclu: true })
      );
      await loadData();
      refreshOpenContact({ ...contact, famille_regroupement_exclu: true });
      toast.success(`${contact.prenom} ${contact.nom} retiré du regroupement`);
    } catch (error) {
      console.error("Erreur exclusion famille:", error);
      toast.error("Impossible de retirer ce contact du regroupement");
    }
  };

  const requestExcludeFromFamille = (contact: Contact, famille: FamilleGroup) => {
    if (famille.isManual) {
      setPendingMemberAction({ type: "remove_manual", contact, famille });
    } else {
      setPendingMemberAction({ type: "exclude_auto", contact });
    }
  };

  const handleReintegrateFamille = async (contact: Contact) => {
    try {
      await updateContact(
        contact.id,
        contactToUpdatePayload(contact, { famille_regroupement_exclu: false })
      );
      await loadData();
      toast.success(`${contact.prenom} ${contact.nom} réintégré au regroupement`);
    } catch (error) {
      console.error("Erreur réintégration famille:", error);
      toast.error("Impossible de réintégrer ce contact");
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
        <div className="grid gap-4 md:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/50" />
          ))}
        </div>
        <div className="h-10 max-w-md rounded-md bg-muted/50" />
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
            Familles
          </h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-xl">
            Regroupement par nom ou famille manuelle —{" "}
            <span className="tabular-nums text-foreground/80">
              {filteredFamilles.length} famille{filteredFamilles.length !== 1 ? "s" : ""}
            </span>
            {prefs.searchQuery.trim() ? " (recherche active)" : ""}
            {" · "}
            {formatEuroCentimes(totalPatrimoineAvecMoi)} avec moi au total
          </p>
        </div>
        <Button
          type="button"
          className="gap-1.5 shrink-0"
          onClick={() => setShowCreateFamilleModal(true)}
        >
          <Plus className="h-4 w-4" />
          Créer une famille
        </Button>
      </header>

      <FamillesPageHelp />

      <FamillesStatCards
        totalCount={familleGroups.length}
        manualCount={manualCount}
        autoCount={autoCount}
        withFoyerCount={withFoyerCount}
        activeFilter={prefs.statFilter}
        onFilterChange={(filter) => updatePrefs({ statFilter: filter })}
      />

      <FamillesToolbar
        searchQuery={prefs.searchQuery}
        onSearchChange={(searchQuery) => {
          updatePrefs({ searchQuery });
          setHighlightContactId(null);
        }}
        sortId={prefs.sortId}
        onSortChange={(sortId) => updatePrefs({ sortId })}
        statFilter={prefs.statFilter}
        onClearStatFilter={() => updatePrefs({ statFilter: null })}
        onExportCsv={
          expandedFamille
            ? () => {
                try {
                  assertCanExport(canExport);
                  downloadFamilleMembersCsv(expandedFamille);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Export non autorisé");
                }
              }
            : undefined
        }
        showExport={canExport && expandedIsVisible && expandedFamille != null}
      />

      {excludedHomonyms.length > 0 && (
        <div className="rounded-lg border border-dashed border-border/70 bg-muted/15 px-3 py-3">
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Hors regroupement ({excludedHomonyms.length}) — homonymes retirés manuellement
          </p>
          <ul className="flex flex-wrap gap-2">
            {excludedHomonyms.map((c) => (
              <li
                key={c.id}
                className="inline-flex items-center gap-2 rounded-md border border-border/60 bg-card px-2.5 py-1 text-xs"
              >
                <button
                  type="button"
                  className="hover:text-primary font-medium"
                  onClick={() => openMember(c)}
                >
                  {c.prenom} {c.nom}
                </button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs"
                  onClick={() => void handleReintegrateFamille(c)}
                >
                  Réintégrer
                </Button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Liste des familles</CardTitle>
          <CardDescription>
            {prefs.searchQuery.trim()
              ? `${filteredFamilles.length} résultat(s)`
              : "Cliquez sur une carte pour déplier les membres"}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {filteredFamilles.length === 0 ? (
            <div className="py-14 text-center text-muted-foreground rounded-xl border border-dashed border-border/80 bg-muted/15">
              {prefs.searchQuery.trim() ? (
                <p>Aucune famille ne correspond à votre recherche.</p>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium text-foreground/80">Aucune famille détectée</p>
                  <p className="text-sm max-w-sm mx-auto">
                    Créez une famille manuellement ou attendez deux homonymes pour un
                    regroupement automatique.
                  </p>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="mt-2"
                    onClick={() => setShowCreateFamilleModal(true)}
                  >
                    Créer une famille
                  </Button>
                </div>
              )}
            </div>
          ) : (
            filteredFamilles.map((famille) => {
              const isExpanded = expandedFamilleKey === famille.key;
              return (
                <div
                  key={famille.key}
                  className={cn(
                    "rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm transition-shadow",
                    isExpanded && "ring-1 ring-primary/20"
                  )}
                >
                  <div className="p-1">
                    <FamilleSummaryCard
                      famille={famille}
                      memberCount={coreMemberCount(famille)}
                      selected={isExpanded}
                      onClick={() => toggleFamille(famille)}
                      actionHint={isExpanded ? "Replier les membres" : "Voir les membres"}
                    />
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/60 bg-muted/15 px-4 py-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {coreMemberCount(famille)} membre
                          {coreMemberCount(famille) > 1 ? "s" : ""} ·{" "}
                          {formatEuroCentimes(famille.patrimoineAvecMoi)} avec moi
                          {famille.isManual && (
                            <span className="normal-case ml-2">· Famille manuelle</span>
                          )}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          disabled={addMemberLoading}
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleAddMemberClick(famille);
                          }}
                        >
                          <UserPlus className="h-4 w-4" />
                          Ajouter un membre
                        </Button>
                      </div>
                      <FamilleMemberTree
                        famille={famille}
                        foyers={foyers}
                        isManual={famille.isManual}
                        onRoleChange={handleRoleFamilleChange}
                        onMemberClick={openMember}
                        onExcludeFromFamille={(c) =>
                          requestExcludeFromFamille(c, famille)
                        }
                        highlightContactId={
                          isExpanded ? (highlightContactId ?? undefined) : undefined
                        }
                        showTitle
                      />
                    </div>
                  )}
                </div>
              );
            })
          )}
        </CardContent>
      </Card>

      <FamilleCreateModal
        open={showCreateFamilleModal}
        onOpenChange={setShowCreateFamilleModal}
        onSuccess={(familleId) => {
          setExpandedKey(`manual:${familleId}`);
          void loadData();
        }}
      />

      {showAddMemberModal && addMemberFamille?.familleId != null && (
        <FamilleAddMemberModal
          open={showAddMemberModal}
          onOpenChange={(open) => {
            setShowAddMemberModal(open);
            if (!open) setAddMemberFamille(null);
          }}
          famille={addMemberFamille}
          existingMemberIds={addMemberFamille.membres
            .map((m) => m.contact.id!)
            .filter(Boolean)}
          onSuccess={() => void loadData()}
        />
      )}

      {contactDetailSheet}

      <AlertDialog
        open={pendingMemberAction != null}
        onOpenChange={(open) => !open && setPendingMemberAction(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingMemberAction?.type === "remove_manual"
                ? "Retirer de la famille ?"
                : "Retirer du regroupement ?"}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm text-muted-foreground">
                {pendingMemberAction?.type === "remove_manual" && (
                  <p>
                    Retirer{" "}
                    <strong>
                      {pendingMemberAction.contact.prenom}{" "}
                      {pendingMemberAction.contact.nom}
                    </strong>{" "}
                    de la famille « {pendingMemberAction.famille.nom} » ?
                  </p>
                )}
                {pendingMemberAction?.type === "exclude_auto" && (
                  <p>
                    Retirer{" "}
                    <strong>
                      {pendingMemberAction.contact.prenom}{" "}
                      {pendingMemberAction.contact.nom}
                    </strong>{" "}
                    du regroupement « {pendingMemberAction.contact.nom.toUpperCase()} » ?
                    Le contact reste dans le CRM mais ne sera plus listé avec les
                    homonymes.
                  </p>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (!pendingMemberAction) return;
                if (pendingMemberAction.type === "remove_manual") {
                  void executeRemoveFromManualFamille(
                    pendingMemberAction.contact,
                    pendingMemberAction.famille
                  );
                } else {
                  void executeExcludeFromFamille(pendingMemberAction.contact);
                }
                setPendingMemberAction(null);
              }}
            >
              Retirer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
