import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Plus, Building2, FileText, Pencil } from "lucide-react";
import { toast } from "sonner";
import {
  getAllPartenaires,
  deletePartenaire,
  type Partenaire,
} from "@/lib/api/tauri-partenaires";
import { getAllInvestissements, type Investissement } from "@/lib/api/tauri-investissements";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import { PartenaireForm } from "@/components/partenaires/PartenaireForm";
import { PartenaireDetail } from "@/components/partenaires/PartenaireDetail";
import { PartenaireSummaryCard } from "@/components/partenaires/PartenaireSummaryCard";
import { PartenaireProductList } from "@/components/partenaires/PartenaireProductList";
import {
  PartenairesPageHelp,
  PartenairesStatCards,
  PartenairesToolbar,
} from "@/components/partenaires/partenaires-page-ui";
import {
  buildPartenaireRows,
  filterPartenaireRowsByStat,
  filterPartenaireRowsByType,
  findPartenaireIdForInvestissement,
  searchPartenaireRows,
  sortPartenaireRows,
} from "@/lib/partenaires/partenaires-search";
import {
  buildMetaParPartenaireId,
  countProduitsLies,
  indexInvestissementsByPartenaire,
} from "@/lib/partenaires/partenaires-meta";
import {
  loadPartenairesPagePreferences,
  savePartenairesPagePreferences,
  type PartenairesPagePreferences,
} from "@/lib/partenaires/partenaires-page-preferences";
import { useCanExport } from "@/components/team/TeamWorkspaceProvider";
import { assertCanExport } from "@/lib/export/assert-can-export";
import { downloadPartenaireProductsCsv } from "@/lib/partenaires/partenaires-export";
import {
  consumePartenairesNavigationIntent,
  type PartenairesNavigationIntent,
} from "@/lib/navigation/partenaires-navigation";
import { getPartenaireTypeInfo } from "@/lib/partenaires/partenaire-display";
import { formatEuroCentimes } from "@/lib/investissements/investissement-display";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import { useEventAutoRefresh } from "@/hooks/useEventAutoRefresh";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { subscribePartenairesChanged } from "@/lib/partenaires/partenaire-events";
import { subscribeInvestissementsChanged } from "@/lib/investissements/investissement-events";
import { subscribeFoyersChanged } from "@/lib/foyers/foyer-events";
import { navigateToFoyers } from "@/lib/navigation/foyers-navigation";
import { cn } from "@/lib/utils";

type PartenairesProps = {
  onNavigate?: (page: string) => void;
};

export function Partenaires({ onNavigate }: PartenairesProps) {
  const canExport = useCanExport();
  const [prefs, setPrefs] = useState<PartenairesPagePreferences>(() =>
    loadPartenairesPagePreferences()
  );
  const [partenaires, setPartenaires] = useState<Partenaire[]>([]);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [investissements, setInvestissements] = useState<Investissement[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPartenaireId, setExpandedPartenaireId] = useState<number | null>(
    () => loadPartenairesPagePreferences().expandedPartenaireId
  );
  const [highlightInvestissementId, setHighlightInvestissementId] = useState<number | null>(
    null
  );
  const pendingFocusInvestissementIdRef = useRef<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formPartenaire, setFormPartenaire] = useState<Partenaire | null>(null);
  const [showPartenaireDetail, setShowPartenaireDetail] = useState(false);
  const [partenaireDetailId, setPartenaireDetailId] = useState<number | null>(null);

  const updatePrefs = useCallback((patch: Partial<PartenairesPagePreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      savePartenairesPagePreferences(next);
      return next;
    });
  }, []);

  const loadPartenaires = useCallback(async () => {
    try {
      const [data, allInv, contactsData, foyersData] = await Promise.all([
        getAllPartenaires(),
        getAllInvestissements(),
        getAllContacts(),
        getAllFoyers(),
      ]);
      setPartenaires(data);
      setInvestissements(allInv);
      setContacts(contactsData);
      setFoyers(foyersData);
    } catch (error) {
      console.error("Error loading partenaires:", error);
      toast.error("Impossible de charger les partenaires");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadPartenaires();
  }, [loadPartenaires]);

  useEventAutoRefresh(
    loadPartenaires,
    subscribeContactsChanged,
    subscribePartenairesChanged,
    subscribeInvestissementsChanged,
    subscribeFoyersChanged
  );

  const { openContactSheet, sheet: contactDetailSheet } = useContactDetailSheet({
    onNavigate,
    onUpdate: () => void loadPartenaires(),
  });

  const handleOpenContact = (contactId: number, contactIds?: number[]) => {
    void openContactSheet(contactId, contactIds);
  };

  const metaParId = useMemo(
    () => buildMetaParPartenaireId(investissements),
    [investissements]
  );
  const byPartenaireId = useMemo(
    () => indexInvestissementsByPartenaire(investissements),
    [investissements]
  );
  const totalProduitsLies = useMemo(
    () => countProduitsLies(investissements),
    [investissements]
  );

  const contactLabelById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const c of contacts) {
      if (c.id == null) continue;
      map[c.id] = [c.prenom, c.nom].filter(Boolean).join(" ").trim() || `Contact #${c.id}`;
    }
    return map;
  }, [contacts]);

  const foyerLabelById = useMemo(() => {
    const map: Record<number, string> = {};
    for (const f of foyers) {
      if (f.id == null) continue;
      map[f.id] = f.nom?.trim() || `Foyer #${f.id}`;
    }
    return map;
  }, [foyers]);

  const partenaireRows = useMemo(
    () => buildPartenaireRows(partenaires, metaParId, byPartenaireId),
    [partenaires, metaParId, byPartenaireId]
  );

  const applyPartenairesIntent = useCallback(
    (intent: PartenairesNavigationIntent) => {
      const hasNavigationTarget =
        intent.partenaireId != null || intent.focusInvestissementId != null;
      const prefsPatch: Partial<PartenairesPagePreferences> = {};
      if (hasNavigationTarget) {
        prefsPatch.searchQuery = "";
        prefsPatch.statFilter = null;
        prefsPatch.typeFilter = "ALL";
      }
      if (intent.partenaireId != null) {
        setExpandedPartenaireId(intent.partenaireId);
        prefsPatch.expandedPartenaireId = intent.partenaireId;
      }
      if (Object.keys(prefsPatch).length > 0) {
        updatePrefs(prefsPatch);
      }
      if (intent.focusInvestissementId != null) {
        setHighlightInvestissementId(intent.focusInvestissementId);
        pendingFocusInvestissementIdRef.current = intent.focusInvestissementId;
      } else if (hasNavigationTarget) {
        setHighlightInvestissementId(null);
        pendingFocusInvestissementIdRef.current = null;
      }
    },
    [updatePrefs]
  );

  useEffect(() => {
    applyPartenairesIntent(consumePartenairesNavigationIntent());
  }, [applyPartenairesIntent]);

  useAppNavigationListener((detail) => {
    if (detail.type === "partenaires") {
      applyPartenairesIntent({
        partenaireId: detail.partenaireId,
        focusInvestissementId: detail.focusInvestissementId,
      });
      consumePartenairesNavigationIntent();
      return;
    }
    if (detail.type === "page" && detail.page === "partenaires") {
      applyPartenairesIntent(consumePartenairesNavigationIntent());
    }
  }, [applyPartenairesIntent]);

  useEffect(() => {
    if (pendingFocusInvestissementIdRef.current == null || partenaireRows.length === 0) return;
    const focusId = pendingFocusInvestissementIdRef.current;
    pendingFocusInvestissementIdRef.current = null;
    const partenaireId = findPartenaireIdForInvestissement(focusId, partenaireRows);
    if (partenaireId != null) {
      setExpandedPartenaireId(partenaireId);
      updatePrefs({ expandedPartenaireId: partenaireId });
    }
  }, [partenaireRows, updatePrefs]);

  const filteredRows = useMemo(() => {
    const statFilter = prefs.statFilter ?? null;
    const byType = filterPartenaireRowsByType(partenaireRows, prefs.typeFilter);
    const byStat = filterPartenaireRowsByStat(byType, statFilter);
    const searched = searchPartenaireRows(prefs.searchQuery, byStat);
    return sortPartenaireRows(searched.rows, prefs.sortId);
  }, [partenaireRows, prefs]);

  useEffect(() => {
    if (loading || expandedPartenaireId == null) return;
    if (partenaires.some((p) => p.id === expandedPartenaireId)) return;
    const saved = prefs.expandedPartenaireId;
    if (saved != null && partenaires.some((p) => p.id === saved)) {
      setExpandedPartenaireId(saved);
    } else {
      setExpandedPartenaireId(null);
      updatePrefs({ expandedPartenaireId: null });
    }
  }, [loading, partenaires, expandedPartenaireId, prefs.expandedPartenaireId, updatePrefs]);

  const expandedRow = useMemo(
    () =>
      expandedPartenaireId != null
        ? (partenaireRows.find((r) => r.partenaire.id === expandedPartenaireId) ?? null)
        : null,
    [partenaireRows, expandedPartenaireId]
  );

  const expandedIsVisible =
    expandedPartenaireId != null &&
    filteredRows.some((r) => r.partenaire.id === expandedPartenaireId);

  const partenaireDetailTarget = useMemo(
    () =>
      partenaireDetailId != null
        ? (partenaires.find((p) => p.id === partenaireDetailId) ?? null)
        : null,
    [partenaires, partenaireDetailId]
  );

  const encoursViaPartenaires = useMemo(
    () => Object.values(metaParId).reduce((s, m) => s + m.encoursAvecMoi, 0),
    [metaParId]
  );

  const promoteurCount = partenaireRows.filter(
    (r) => r.partenaire.type_partenaire === "PROMOTEUR"
  ).length;
  const withEncoursCount = partenaireRows.filter((r) => r.meta.encoursAvecMoi > 0).length;
  const assureurCount = partenaireRows.filter(
    (r) => r.partenaire.type_partenaire === "ASSUREUR"
  ).length;
  const scpiCount = partenaireRows.filter(
    (r) =>
      r.partenaire.type_partenaire === "SOCIETE_GESTION_SCPI" ||
      r.partenaire.type_partenaire === "SOCIETE_GESTION" ||
      r.partenaire.type_partenaire === "SOCIETE_GESTION_FIP"
  ).length;

  const handleOpenFoyer = (foyerId: number) => {
    if (onNavigate) {
      navigateToFoyers(onNavigate, {
        foyerId,
        currentPage: "partenaires",
      });
    }
  };

  const togglePartenaire = (partenaire: Partenaire) => {
    setExpandedPartenaireId((prev) => {
      const next = prev === partenaire.id ? null : partenaire.id;
      updatePrefs({ expandedPartenaireId: next });
      return next;
    });
  };

  const openPartenaireDetail = (partenaireId: number) => {
    setPartenaireDetailId(partenaireId);
    setShowPartenaireDetail(true);
  };

  const openCreateForm = () => {
    setFormPartenaire(null);
    setShowForm(true);
  };

  const openEditForm = (partenaire: Partenaire) => {
    setFormPartenaire(partenaire);
    setShowForm(true);
  };

  const handleDeletePartenaire = async (id: number) => {
    try {
      await deletePartenaire(id);
      if (expandedPartenaireId === id) {
        setExpandedPartenaireId(null);
        updatePrefs({ expandedPartenaireId: null });
      }
      if (partenaireDetailId === id) {
        setShowPartenaireDetail(false);
        setPartenaireDetailId(null);
      }
      await loadPartenaires();
      toast.success("Partenaire supprimé");
    } catch (error) {
      console.error("Error deleting partenaire:", error);
      toast.error("Impossible de supprimer le partenaire");
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
            Partenaires
          </h2>
          <p className="text-muted-foreground mt-1 text-sm max-w-2xl">
            Assureurs, sociétés de gestion et promoteurs — référentiels des produits clients.
          </p>
          <p className="text-muted-foreground mt-1 text-sm">
            Encours avec moi —{" "}
            <span className="tabular-nums text-foreground/80">
              {formatEuroCentimes(encoursViaPartenaires)}
            </span>
            {" · "}
            <span className="tabular-nums text-foreground/80">
              {filteredRows.length} sur {partenaires.length}
            </span>
          </p>
        </div>
        <Button className="gap-2 shadow-sm" onClick={openCreateForm}>
          <Plus className="h-4 w-4" />
          Nouveau partenaire
        </Button>
      </header>

      <PartenairesPageHelp />

      <PartenairesStatCards
        totalCount={partenaires.length}
        promoteurCount={promoteurCount}
        withEncoursCount={withEncoursCount}
        assureurCount={assureurCount}
        scpiCount={scpiCount}
        totalProduitsLies={totalProduitsLies}
        activeFilter={prefs.statFilter}
        onFilterChange={(filter) => updatePrefs({ statFilter: filter })}
      />

      <PartenairesToolbar
        searchQuery={prefs.searchQuery}
        onSearchChange={(searchQuery) => {
          updatePrefs({ searchQuery });
          setHighlightInvestissementId(null);
        }}
        sortId={prefs.sortId}
        onSortChange={(sortId) => updatePrefs({ sortId })}
        typeFilter={prefs.typeFilter}
        onTypeFilterChange={(typeFilter) => updatePrefs({ typeFilter })}
        statFilter={prefs.statFilter}
        onClearStatFilter={() => updatePrefs({ statFilter: null })}
        onExportCsv={
          expandedRow
            ? () => {
                try {
                  assertCanExport(canExport);
                  downloadPartenaireProductsCsv(expandedRow, contactLabelById, foyerLabelById);
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : "Export non autorisé");
                }
              }
            : undefined
        }
        showExport={canExport && expandedIsVisible && expandedRow != null}
      />

      <Card className="border-border/70 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="font-serif text-lg">Répertoire</CardTitle>
          <CardDescription>
            {prefs.searchQuery.trim() || prefs.typeFilter !== "ALL" || prefs.statFilter
              ? `${filteredRows.length} résultat(s)`
              : "Cliquez sur une carte pour déplier les produits liés"}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0 space-y-3">
          {filteredRows.length === 0 ? (
            <div className="py-14 text-center rounded-xl border border-dashed border-border/80 bg-muted/15">
              <Building2 className="h-12 w-12 mx-auto text-muted-foreground/35 mb-3" />
              <p className="font-medium text-foreground/90">
                {prefs.searchQuery.trim() || prefs.statFilter || prefs.typeFilter !== "ALL"
                  ? "Aucun partenaire trouvé"
                  : "Aucun partenaire"}
              </p>
              <p className="text-sm text-muted-foreground mt-1 mb-4 max-w-sm mx-auto">
                {prefs.searchQuery.trim() || prefs.statFilter || prefs.typeFilter !== "ALL"
                  ? "Modifiez la recherche ou les filtres."
                  : "Ajoutez assureurs, gestionnaires SCPI/FIP ou promoteurs."}
              </p>
              {!prefs.searchQuery.trim() && !prefs.statFilter && prefs.typeFilter === "ALL" && (
                <Button onClick={openCreateForm} className="gap-2">
                  <Plus className="h-4 w-4" />
                  Ajouter un partenaire
                </Button>
              )}
            </div>
          ) : (
            filteredRows.map((row) => {
              const isExpanded = expandedPartenaireId === row.partenaire.id;
              const { partenaire, meta, investissements: rowInv } = row;
              const typeInfo = getPartenaireTypeInfo(partenaire.type_partenaire);

              return (
                <div
                  key={partenaire.id}
                  className={cn(
                    "rounded-xl border border-border/70 bg-card overflow-hidden shadow-sm transition-shadow",
                    isExpanded && "ring-1 ring-primary/20"
                  )}
                >
                  <div className="p-1">
                    <PartenaireSummaryCard
                      partenaire={partenaire}
                      meta={meta}
                      selected={isExpanded}
                      onClick={() => togglePartenaire(partenaire)}
                      actionHint={isExpanded ? "Replier les produits" : "Voir les produits liés"}
                    />
                  </div>

                  {isExpanded && (
                    <div className="border-t border-border/60 bg-muted/15 px-4 py-4 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {typeInfo.label}
                          {meta.investissementCount > 0 && (
                            <>
                              {" "}
                              · {meta.investissementCount} produit
                              {meta.investissementCount > 1 ? "s" : ""}
                            </>
                          )}
                          {meta.encoursAvecMoi > 0 && (
                            <>
                              {" "}
                              · {formatEuroCentimes(meta.encoursAvecMoi)} encours avec moi
                            </>
                          )}
                        </p>
                        <div className="flex flex-wrap items-center gap-2">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => openEditForm(partenaire)}
                          >
                            <Pencil className="h-4 w-4" />
                            Modifier
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            className="gap-1.5"
                            onClick={() => openPartenaireDetail(partenaire.id)}
                          >
                            <FileText className="h-4 w-4" />
                            Fiche complète
                          </Button>
                        </div>
                      </div>

                      <PartenaireProductList
                        investissements={rowInv}
                        contactLabelById={contactLabelById}
                        foyerLabelById={foyerLabelById}
                        highlightInvestissementId={
                          isExpanded ? (highlightInvestissementId ?? undefined) : undefined
                        }
                        onOpenContact={handleOpenContact}
                        onOpenFoyer={onNavigate ? handleOpenFoyer : undefined}
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

      <PartenaireForm
        open={showForm}
        onOpenChange={(open) => {
          setShowForm(open);
          if (!open) setFormPartenaire(null);
        }}
        partenaire={formPartenaire}
        onSuccess={async (partenaireId) => {
          await loadPartenaires();
          if (partenaireId != null) {
            setExpandedPartenaireId(partenaireId);
            updatePrefs({ expandedPartenaireId: partenaireId });
          }
        }}
      />

      {partenaireDetailTarget && (
        <PartenaireDetail
          key={partenaireDetailTarget.id}
          open={showPartenaireDetail}
          onOpenChange={(open) => {
            setShowPartenaireDetail(open);
            if (!open) setPartenaireDetailId(null);
          }}
          partenaire={partenaireDetailTarget}
          preloadedInvestissements={byPartenaireId[partenaireDetailTarget.id] ?? []}
          onDelete={handleDeletePartenaire}
          onUpdate={() => void loadPartenaires()}
          onOpenContact={handleOpenContact}
        />
      )}

      {contactDetailSheet}
    </div>
  );
}
