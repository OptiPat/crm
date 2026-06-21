import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, FileText } from "lucide-react";
import { toast } from "sonner";
import { getAllFoyers, deleteFoyer, type Foyer } from "@/lib/api/tauri-foyers";
import { cleanupOrphanedData, deleteContact, getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getContactsForFoyer } from "@/lib/foyers/foyer-utils";
import { getAllInvestissements, type Investissement } from "@/lib/api/tauri-investissements";
import { buildPatrimoineMaps, indexInvestissementsByOwner } from "@/lib/investissements/bulk-patrimoine";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { getFoyerTypeLabel } from "@/lib/foyers/foyer-display";
import { FoyerForm } from "@/components/foyers/FoyerForm";
import { FoyerDetail } from "@/components/foyers/FoyerDetail";
import { FoyerSummaryCard } from "@/components/foyers/FoyerSummaryCard";
import { FoyerMemberList } from "@/components/foyers/FoyerMemberList";
import {
  FoyersPageHelp,
  FoyersStatCards,
  FoyersToolbar,
} from "@/components/foyers/foyers-page-ui";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import {
  filterFoyerRowsByStat,
  filterFoyerRowsByType,
  findFoyerIdForContact,
  searchFoyerRows,
  sortFoyerRows,
  type FoyerRow,
} from "@/lib/foyers/foyers-search";
import {
  loadFoyersPagePreferences,
  saveFoyersPagePreferences,
  type FoyersPagePreferences,
} from "@/lib/foyers/foyers-page-preferences";
import { downloadFoyerMembersCsv } from "@/lib/foyers/foyers-export";
import { buildFoyerMembersWithInvestments } from "@/lib/foyers/foyers-member-patrimoine";
import {
  consumeFoyersNavigationIntent,
  type FoyersNavigationIntent,
} from "@/lib/navigation/foyers-navigation";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { cn } from "@/lib/utils";

type FoyersProps = {
  onNavigate?: (page: string) => void;
};

export function Foyers({ onNavigate }: FoyersProps) {
  const [prefs, setPrefs] = useState<FoyersPagePreferences>(() =>
    loadFoyersPagePreferences()
  );
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [patrimoineParFoyer, setPatrimoineParFoyer] = useState<Record<number, number>>(
    {}
  );
  const [investissementsByContact, setInvestissementsByContact] = useState<
    Record<number, Investissement[]>
  >({});
  const [investissementsByFoyer, setInvestissementsByFoyer] = useState<
    Record<number, Investissement[]>
  >({});
  const [loading, setLoading] = useState(true);
  const [expandedFoyerId, setExpandedFoyerId] = useState<number | null>(
    () => loadFoyersPagePreferences().expandedFoyerId
  );
  const [highlightContactId, setHighlightContactId] = useState<number | null>(null);
  const pendingFocusContactIdRef = useRef<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [showFoyerDetail, setShowFoyerDetail] = useState(false);
  const [foyerDetailId, setFoyerDetailId] = useState<number | null>(null);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showContactDetail, setShowContactDetail] = useState(false);

  const updatePrefs = useCallback((patch: Partial<FoyersPagePreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveFoyersPagePreferences(next);
      return next;
    });
  }, []);

  const loadFoyers = useCallback(async () => {
    try {
      await cleanupOrphanedData();
      const [foyersData, contactsData] = await Promise.all([
        getAllFoyers(),
        getAllContacts(),
      ]);
      setContacts(contactsData);

      const allInv = await getAllInvestissements();
      const indexed = indexInvestissementsByOwner(allInv);
      setInvestissementsByContact(indexed.byContactId);
      setInvestissementsByFoyer(indexed.byFoyerId);
      const maps = buildPatrimoineMaps(contactsData, foyersData, allInv);
      const patrimoines: Record<number, number> = {};
      for (const foyer of foyersData) {
        patrimoines[foyer.id] = Math.round(
          (maps.patrimoinesAvecMoi[`foyer_${foyer.id}`] ?? 0) * 100
        );
      }

      setFoyers(foyersData);
      setPatrimoineParFoyer(patrimoines);
      setSelectedContact((prev) => {
        if (!prev?.id) return prev;
        return contactsData.find((c) => c.id === prev.id) ?? prev;
      });
    } catch (error) {
      console.error("Error loading foyers:", error);
      toast.error("Impossible de charger les foyers");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadFoyers();
  }, [loadFoyers]);

  useEventAutoRefresh(
    loadFoyers,
    subscribeContactsChanged,
    subscribeFoyersChanged,
    subscribeInvestissementsChanged
  );

  const foyerRows = useMemo((): FoyerRow[] => {
    return foyers.map((foyer) => ({
      foyer,
      membres: getContactsForFoyer(contacts, foyer.id),
      patrimoineAvecMoi: patrimoineParFoyer[foyer.id] ?? 0,
    }));
  }, [foyers, contacts, patrimoineParFoyer]);

  const applyFoyersIntent = useCallback(
    (intent: FoyersNavigationIntent) => {
      const hasNavigationTarget =
        intent.foyerId != null || intent.focusContactId != null;
      const prefsPatch: Partial<FoyersPagePreferences> = {};
      if (hasNavigationTarget) {
        prefsPatch.searchQuery = "";
        prefsPatch.statFilter = null;
        prefsPatch.typeFilter = "ALL";
      }
      if (intent.foyerId != null) {
        setExpandedFoyerId(intent.foyerId);
        prefsPatch.expandedFoyerId = intent.foyerId;
      }
      if (Object.keys(prefsPatch).length > 0) {
        updatePrefs(prefsPatch);
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
    applyFoyersIntent(consumeFoyersNavigationIntent());
  }, [applyFoyersIntent]);

  useAppNavigationListener((detail) => {
    if (detail.type === "foyers") {
      applyFoyersIntent({
        foyerId: detail.foyerId,
        focusContactId: detail.focusContactId,
      });
      consumeFoyersNavigationIntent();
      return;
    }
    if (detail.type === "page" && detail.page === "foyers") {
      applyFoyersIntent(consumeFoyersNavigationIntent());
    }
  }, [applyFoyersIntent]);

  useEffect(() => {
    if (pendingFocusContactIdRef.current == null || foyerRows.length === 0) return;
    const focusId = pendingFocusContactIdRef.current;
    pendingFocusContactIdRef.current = null;
    const foyerId = findFoyerIdForContact(focusId, foyerRows);
    if (foyerId != null) {
      setExpandedFoyerId(foyerId);
      updatePrefs({ expandedFoyerId: foyerId });
    }
  }, [foyerRows, updatePrefs]);

  const { filteredRows, searchFocusId } = useMemo(() => {
    const statFilter = prefs.statFilter ?? null;
    const byType = filterFoyerRowsByType(foyerRows, prefs.typeFilter);
    const byStat = filterFoyerRowsByStat(byType, statFilter);
    const searched = searchFoyerRows(prefs.searchQuery, byStat);
    const sorted = sortFoyerRows(searched.rows, prefs.sortId);
    return {
      filteredRows: sorted,
      searchFocusId: searched.focusContactId,
    };
  }, [foyerRows, prefs]);

  const effectiveHighlightId = prefs.searchQuery.trim()
    ? (searchFocusId ?? highlightContactId)
    : (highlightContactId ?? searchFocusId);

  useEffect(() => {
    if (searchFocusId == null || !prefs.searchQuery.trim()) return;
    const foyerId = findFoyerIdForContact(searchFocusId, foyerRows);
    if (foyerId != null) {
      setExpandedFoyerId(foyerId);
      updatePrefs({ expandedFoyerId: foyerId });
    }
  }, [searchFocusId, prefs.searchQuery, foyerRows, updatePrefs]);

  useEffect(() => {
    if (loading || expandedFoyerId == null) return;
    if (foyers.some((f) => f.id === expandedFoyerId)) return;
    const saved = prefs.expandedFoyerId;
    if (saved != null && foyers.some((f) => f.id === saved)) {
      setExpandedFoyerId(saved);
    } else {
      setExpandedFoyerId(null);
      updatePrefs({ expandedFoyerId: null });
    }
  }, [loading, foyers, expandedFoyerId, prefs.expandedFoyerId, updatePrefs]);

  const expandedRow = useMemo(
    () =>
      expandedFoyerId != null
        ? (foyerRows.find((r) => r.foyer.id === expandedFoyerId) ?? null)
        : null,
    [foyerRows, expandedFoyerId]
  );

  const expandedIsVisible =
    expandedFoyerId != null &&
    filteredRows.some((r) => r.foyer.id === expandedFoyerId);

  const foyerDetailTarget = useMemo(
    () =>
      foyerDetailId != null ? (foyers.find((f) => f.id === foyerDetailId) ?? null) : null,
    [foyers, foyerDetailId]
  );

  const totalPatrimoineAvecMoi = useMemo(
    () => Object.values(patrimoineParFoyer).reduce((s, v) => s + v, 0),
    [patrimoineParFoyer]
  );

  const contactsRattaches = useMemo(
    () => contacts.filter((c) => c.foyer_id != null).length,
    [contacts]
  );

  const emptyCount = foyerRows.filter((r) => r.membres.length === 0).length;
  const withPatrimoineCount = foyerRows.filter((r) => r.patrimoineAvecMoi > 0).length;
  const coupleCount = foyerRows.filter((r) => r.foyer.type_foyer === "COUPLE").length;

  const toggleFoyer = (foyer: Foyer) => {
    setExpandedFoyerId((prev) => {
      const next = prev === foyer.id ? null : foyer.id;
      updatePrefs({ expandedFoyerId: next });
      return next;
    });
  };

  const openMember = (contact: Contact) => {
    setSelectedContact(contact);
    setShowContactDetail(true);
  };

  const openFoyerDetail = (foyerId: number) => {
    setFoyerDetailId(foyerId);
    setShowFoyerDetail(true);
  };

  const handleDeleteFoyer = async (id: number) => {
    try {
      await deleteFoyer(id);
      if (expandedFoyerId === id) {
        setExpandedFoyerId(null);
        updatePrefs({ expandedFoyerId: null });
      }
      if (foyerDetailId === id) {
        setShowFoyerDetail(false);
        setFoyerDetailId(null);
      }
      await loadFoyers();
      toast.success("Foyer supprimé");
    } catch (error) {
      console.error("Error deleting foyer:", error);
      toast.error("Impossible de supprimer le foyer");
    }
  };

  const handleDeleteContact = async (id: number) => {
    try {
      await deleteContact(id);
      await loadFoyers();
      if (selectedContact?.id === id) {
        setSelectedContact(null);
        setShowContactDetail(false);
      }
      toast.success("Contact supprimé");
    } catch (error) {
      console.error("Erreur suppression contact:", error);
      toast.error("Impossible de supprimer le contact");
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
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-muted/50" />
          ))}
        </div>
        <div className="h-10 max-w-md rounded-md bg-muted/50" />
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
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
            Foyers
          </h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Regrouper des personnes qui déclarent ensemble — noms de famille différents
            possibles.
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Patrimoine avec moi —{" "}
            <span className="tabular-nums text-foreground/80">
              {formatEuroCentimes(totalPatrimoineAvecMoi)}
            </span>
            {" · "}
            <span className="tabular-nums text-foreground/80">
              {filteredRows.length} sur {foyers.length}
            </span>
          </p>
        </div>
        <Button className="gap-2 shadow-sm" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nouveau foyer
        </Button>
      </header>

      <FoyersPageHelp />

      <FoyersStatCards
        totalCount={foyers.length}
        emptyCount={emptyCount}
        withPatrimoineCount={withPatrimoineCount}
        coupleCount={coupleCount}
        contactsRattaches={contactsRattaches}
        activeFilter={prefs.statFilter}
        onFilterChange={(filter) => updatePrefs({ statFilter: filter })}
      />

      <FoyersToolbar
        searchQuery={prefs.searchQuery}
        onSearchChange={(searchQuery) => updatePrefs({ searchQuery })}
        sortId={prefs.sortId}
        onSortChange={(sortId) => updatePrefs({ sortId })}
        typeFilter={prefs.typeFilter}
        onTypeFilterChange={(typeFilter) => updatePrefs({ typeFilter })}
        statFilter={prefs.statFilter}
        onClearStatFilter={() => updatePrefs({ statFilter: null })}
        onExportCsv={
          expandedRow ? () => downloadFoyerMembersCsv(expandedRow) : undefined
        }
        showExport={expandedIsVisible && expandedRow != null}
      />

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Liste des foyers</CardTitle>
          <CardDescription>
            {prefs.searchQuery.trim() || prefs.typeFilter !== "ALL" || prefs.statFilter
              ? `${filteredRows.length} résultat(s)`
              : "Cliquez sur une carte pour déplier les membres"}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {filteredRows.length === 0 ? (
            <div className="py-14 text-center rounded-xl border border-dashed border-border/80 bg-muted/15">
              <p className="font-medium text-foreground/90">
                {prefs.searchQuery.trim() || prefs.statFilter || prefs.typeFilter !== "ALL"
                  ? "Aucun foyer trouvé"
                  : "Aucun foyer"}
              </p>
              <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
                {prefs.searchQuery.trim() || prefs.statFilter || prefs.typeFilter !== "ALL"
                  ? "Modifiez la recherche ou les filtres."
                  : "Créez un foyer fiscal pour regrouper contacts et patrimoine commun."}
              </p>
              {!prefs.searchQuery.trim() && !prefs.statFilter && prefs.typeFilter === "ALL" && (
                <Button onClick={() => setShowForm(true)} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Créer un foyer
                </Button>
              )}
            </div>
          ) : (
            filteredRows.map((row) => {
              const isExpanded = expandedFoyerId === row.foyer.id;
              const { foyer, membres, patrimoineAvecMoi } = row;
              return (
                <div
                  key={foyer.id}
                  className={cn(
                    "rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm transition-shadow",
                    isExpanded && "ring-1 ring-primary/20"
                  )}
                >
                  <div className="p-1">
                    <FoyerSummaryCard
                      foyer={foyer}
                      membres={membres}
                      patrimoineAvecMoi={patrimoineAvecMoi}
                      selected={isExpanded}
                      onClick={() => toggleFoyer(foyer)}
                      actionHint={isExpanded ? "Replier les membres" : "Voir les membres"}
                    />
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/60 bg-muted/15 px-4 py-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {membres.length} membre{membres.length !== 1 ? "s" : ""} ·{" "}
                          {getFoyerTypeLabel(foyer.type_foyer)}
                          {patrimoineAvecMoi > 0 && (
                            <>
                              {" "}
                              · {formatEuroCentimes(patrimoineAvecMoi)} avec moi
                            </>
                          )}
                          {foyer.nombre_parts_fiscales != null && (
                            <> · {foyer.nombre_parts_fiscales} parts</>
                          )}
                          {foyer.tranche_imposition && <> · TMI {foyer.tranche_imposition}</>}
                        </p>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="gap-1.5"
                          onClick={() => openFoyerDetail(foyer.id)}
                        >
                          <FileText className="h-4 w-4" />
                          Fiche complète
                        </Button>
                      </div>

                      <FoyerMemberList
                        membres={buildFoyerMembersWithInvestments(
                          membres,
                          investissementsByContact,
                          investissementsByFoyer
                        )}
                        highlightContactId={
                          isExpanded ? (effectiveHighlightId ?? undefined) : undefined
                        }
                        onMemberClick={openMember}
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

      <FoyerForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={(foyerId) => {
          if (foyerId != null) {
            setExpandedFoyerId(foyerId);
            updatePrefs({ expandedFoyerId: foyerId });
          }
          void loadFoyers();
        }}
      />

      {foyerDetailTarget && (
        <FoyerDetail
          key={foyerDetailTarget.id}
          open={showFoyerDetail}
          onOpenChange={(open) => {
            setShowFoyerDetail(open);
            if (!open) setFoyerDetailId(null);
          }}
          foyer={foyerDetailTarget}
          onDelete={handleDeleteFoyer}
          onUpdate={() => void loadFoyers()}
          onMemberClick={(contact) => {
            setShowFoyerDetail(false);
            openMember(contact);
          }}
        />
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
          onDelete={handleDeleteContact}
          onUpdate={() => void loadFoyers()}
          onContactRefreshed={setSelectedContact}
          onNavigate={onNavigate}
          onOpenContact={openMember}
        />
      )}
    </div>
  );
}
