import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useInteractionsAutoRefresh } from "@/hooks/useInteractionsAutoRefresh";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { toast } from "sonner";
import {
  deleteInteraction,
  type ExchangeHistoryEntry,
  type InteractionWithContact,
} from "@/lib/api/tauri-interactions";
import { InteractionForm } from "@/components/interactions/InteractionForm";
import { ExchangeHistoryDetailPanel } from "@/components/interactions/ExchangeHistoryDetailPanel";
import { InteractionsPageHeader } from "@/components/interactions/InteractionsPageHeader";
import {
  InteractionsActiveFilterChips,
  InteractionsContactFilterBanner,
  InteractionsEmptyState,
  InteractionsGroupedList,
  InteractionsPageHelp,
  InteractionsStatCards,
  InteractionsToolbar,
} from "@/components/interactions/interactions-page-ui";
import {
  consumeInteractionsContactFocus,
  setInteractionsContactFocus,
} from "@/lib/navigation/interactions-navigation";
import { navigateToSuivi } from "@/lib/navigation/suivi-navigation";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { useContactDetailSheet } from "@/hooks/useContactDetailSheet";
import {
  exchangeContactName,
  exchangeEntryKey,
  isCampaignRelatedExchangeEntry,
  loadExchangeHistory,
  manualEntryToInteraction,
} from "@/lib/interactions/exchange-history-display";
import { getEtiquetteEmailQueue } from "@/lib/api/tauri-etiquettes";
import {
  buildAwaitingResponseIndex,
  countExchangesByStat,
  filterExchangeHistoryList,
  type AwaitingResponseIndex,
  type ExchangeStatFilter,
} from "@/lib/interactions/exchange-history-filters";
import { groupExchangeHistoryByYearMonth } from "@/lib/interactions/exchange-history-groups";
import {
  loadInteractionsPagePreferences,
  saveInteractionsPagePreferences,
  type InteractionsPagePreferences,
} from "@/lib/interactions/interactions-page-preferences";
import type { ExchangeKindFilter } from "@/lib/interactions/exchange-history-filters";
import { cn } from "@/lib/utils";
import {
  SplitDetailLayout,
  SplitDetailPane,
  SplitListColumn,
  splitCardClassName,
  splitCardContentClassName,
  splitCardHeaderClassName,
} from "@/components/layout";

interface InteractionsProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
}

export function Interactions({ onNavigate }: InteractionsProps) {
  const [prefs, setPrefs] = useState<InteractionsPagePreferences>(() =>
    loadInteractionsPagePreferences()
  );
  const [items, setItems] = useState<ExchangeHistoryEntry[]>([]);
  const [awaitingResponse, setAwaitingResponse] = useState<AwaitingResponseIndex>(() => ({
    keys: new Set(),
  }));
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InteractionWithContact | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ExchangeHistoryEntry | null>(null);
  const [contactFilterId, setContactFilterId] = useState<number | null>(null);
  const [historyLimit, setHistoryLimit] = useState(400);
  const [historyTruncated, setHistoryTruncated] = useState(false);
  const focusConsumedRef = useRef(false);
  const contactFilterIdRef = useRef(contactFilterId);
  contactFilterIdRef.current = contactFilterId;

  const isWideLayout = useMediaQuery("(min-width: 1024px)");
  const showSplit = isWideLayout && selectedEntry != null;

  const updatePrefs = useCallback((patch: Partial<InteractionsPagePreferences>) => {
    setPrefs((prev) => {
      const next = { ...prev, ...patch };
      saveInteractionsPagePreferences(next);
      return next;
    });
  }, []);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const contactId = contactFilterIdRef.current;
      const [data, sentQueue] = await Promise.all([
        loadExchangeHistory(
          contactId != null ? { contactId } : { maxEntries: historyLimit }
        ),
        getEtiquetteEmailQueue("sent"),
      ]);
      setItems(data);
      setAwaitingResponse(buildAwaitingResponseIndex(sentQueue, contactId));
      setHistoryTruncated(
        contactId == null && data.length >= historyLimit && historyLimit > 0
      );
      setSelectedEntry((prev) => {
        if (!prev) return prev;
        return data.find((e) => exchangeEntryKey(e) === exchangeEntryKey(prev)) ?? null;
      });
    } catch (error) {
      console.error(error);
      setLoadError(String(error));
      setItems([]);
      setAwaitingResponse({ keys: new Set() });
      setSelectedEntry(null);
      setHistoryTruncated(false);
    } finally {
      setLoading(false);
    }
  }, [historyLimit]);

  useEffect(() => {
    if (focusConsumedRef.current) return;
    focusConsumedRef.current = true;
    const focusId = consumeInteractionsContactFocus();
    if (focusId != null) {
      setContactFilterId(focusId);
    }
  }, []);

  useEffect(() => {
    setHistoryLimit(400);
  }, [contactFilterId]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load, contactFilterId, historyLimit]);

  useAppNavigationListener((detail) => {
    if (detail.type !== "interactions") return;
    if (detail.contactId != null) {
      setInteractionsContactFocus(detail.contactId);
      setContactFilterId(detail.contactId);
    }
  }, []);

  useInteractionsAutoRefresh(load);

  const { openContactSheet, sheet: contactDetailSheet } = useContactDetailSheet({
    onNavigate,
    onUpdate: () => void load(),
  });

  const filtered = useMemo(
    () =>
      filterExchangeHistoryList(
        items,
        {
          searchQuery: prefs.searchQuery,
          typeFilter: prefs.typeFilter,
          kindFilter: prefs.kindFilter,
          statFilter: prefs.statFilter,
          contactFilterId,
        },
        awaitingResponse
      ),
    [items, prefs, contactFilterId, awaitingResponse]
  );

  const statCounts = useMemo(
    () => countExchangesByStat(items, awaitingResponse),
    [items, awaitingResponse]
  );

  const grouped = useMemo(
    () => groupExchangeHistoryByYearMonth(filtered),
    [filtered]
  );

  const interactionContactIds = useMemo(
    () => [
      ...new Set(
        filtered.map((entry) => entry.contact_id).filter((id) => id != null && id > 0)
      ),
    ],
    [filtered]
  );

  const openContact = useCallback(
    (contactId: number) => {
      void openContactSheet(contactId, interactionContactIds);
    },
    [openContactSheet, interactionContactIds]
  );

  const contactFilterLabel = useMemo(() => {
    if (contactFilterId == null) return null;
    const match = items.find((i) => i.contact_id === contactFilterId);
    if (match) {
      return exchangeContactName(match);
    }
    return `Contact #${contactFilterId}`;
  }, [items, contactFilterId]);

  const emptyVariant = useMemo(() => {
    if (items.length === 0) return "empty" as const;
    if (contactFilterId != null && filtered.length === 0) return "contact_empty" as const;
    return "filtered" as const;
  }, [items.length, contactFilterId, filtered.length]);

  const openEntry = (entry: ExchangeHistoryEntry) => {
    setSelectedEntry(entry);
    if (!isWideLayout) {
      window.setTimeout(() => {
        document
          .getElementById("interaction-detail-panel")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 50);
    }
  };

  useEffect(() => {
    if (loading) return;
    if (
      selectedEntry &&
      !filtered.some((e) => exchangeEntryKey(e) === exchangeEntryKey(selectedEntry))
    ) {
      setSelectedEntry(null);
    }
  }, [loading, filtered, selectedEntry]);

  const handleDelete = async (entry: ExchangeHistoryEntry) => {
    const manual = manualEntryToInteraction(entry);
    if (!manual) return;
    if (!confirm("Supprimer cette interaction ?")) return;
    try {
      await deleteInteraction(manual.id);
      if (
        selectedEntry &&
        exchangeEntryKey(selectedEntry) === exchangeEntryKey(entry)
      ) {
        setSelectedEntry(null);
      }
      toast.success("Interaction supprimée");
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  const startEdit = (entry: ExchangeHistoryEntry) => {
    const manual = manualEntryToInteraction(entry);
    if (!manual) return;
    setEditing(manual);
    setShowForm(true);
  };

  const startCreate = () => {
    setEditing(null);
    setShowForm(true);
  };

  const clearUiFilters = () => {
    updatePrefs({
      searchQuery: "",
      typeFilter: "ALL",
      kindFilter: "all",
      statFilter: null,
    });
  };

  const handleStatFilterChange = (filter: ExchangeStatFilter | null) => {
    if (filter === "email_campagne") {
      updatePrefs({ statFilter: filter, kindFilter: "email_campagne" });
      return;
    }
    if (filter === "manual") {
      updatePrefs({ statFilter: filter, kindFilter: "manual" });
      return;
    }
    updatePrefs({ statFilter: filter });
  };

  const detailPanelProps = (entry: ExchangeHistoryEntry) => ({
    entry,
    onClose: () => setSelectedEntry(null),
    onEdit: !isCampaignRelatedExchangeEntry(entry) ? () => startEdit(entry) : undefined,
    onDelete: !isCampaignRelatedExchangeEntry(entry)
      ? () => void handleDelete(entry)
      : undefined,
    onOpenContact: () => openContact(entry.contact_id),
    onNavigateSuiviEnvois:
      onNavigate && isCampaignRelatedExchangeEntry(entry)
        ? () => navigateToSuivi(onNavigate, "envois")
        : undefined,
    onRefresh: () => void load(),
  });

  return (
    <div
      className={cn(
        "space-y-6 mx-auto w-full",
        showSplit ? "max-w-[1800px]" : "max-w-[1600px]"
      )}
    >
      <InteractionsPageHeader
        filteredCount={filtered.length}
        onNewInteraction={startCreate}
      />

      <InteractionsPageHelp />

      <InteractionsStatCards
        counts={statCounts}
        activeFilter={prefs.statFilter}
        onFilterChange={handleStatFilterChange}
      />

      <Card className={splitCardClassName(showSplit, "min-w-0 border-border/70 shadow-sm")}>
        <CardHeader className={splitCardHeaderClassName(showSplit, "pb-3")}>
          <CardTitle className="text-lg">Journal</CardTitle>
          <CardDescription>
            {items.length} échange{items.length !== 1 ? "s" : ""} enregistré
            {items.length !== 1 ? "s" : ""}
            {historyTruncated ? " (affichage limité)" : ""}
          </CardDescription>
        </CardHeader>

        <CardContent className={splitCardContentClassName(showSplit, "space-y-4 pt-0", true)}>
          {historyTruncated && contactFilterId == null ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setHistoryLimit((n) => n + 400)}
              >
                Charger plus d&apos;échanges
              </Button>
            </div>
          ) : null}

          {contactFilterId != null && contactFilterLabel && (
            <InteractionsContactFilterBanner
              label={contactFilterLabel}
              onOpenContact={() => openContact(contactFilterId)}
              onClear={() => {
                setContactFilterId(null);
                setSelectedEntry(null);
              }}
            />
          )}

          <InteractionsToolbar
            searchQuery={prefs.searchQuery}
            onSearchChange={(searchQuery) => updatePrefs({ searchQuery })}
            typeFilter={prefs.typeFilter}
            onTypeChange={(typeFilter) => updatePrefs({ typeFilter })}
            kindFilter={prefs.kindFilter}
            onKindChange={(kindFilter: ExchangeKindFilter) =>
              updatePrefs({ kindFilter, statFilter: null })
            }
          />

          <InteractionsActiveFilterChips
            statFilter={prefs.statFilter}
            kindFilter={prefs.kindFilter}
            searchQuery={prefs.searchQuery}
            typeFilter={prefs.typeFilter}
            onClearStat={() => updatePrefs({ statFilter: null })}
            onClearKind={() => updatePrefs({ kindFilter: "all" })}
            onClearSearch={() => updatePrefs({ searchQuery: "" })}
            onClearType={() => updatePrefs({ typeFilter: "ALL" })}
          />

          {loadError ? (
            <div className="text-center py-8 space-y-3">
              <p className="text-destructive text-sm">{loadError}</p>
              <Button variant="outline" onClick={() => void load()}>
                Réessayer
              </Button>
            </div>
          ) : loading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-16 rounded-xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <InteractionsEmptyState
              variant={emptyVariant}
              onNewInteraction={startCreate}
              onClearFilters={emptyVariant === "filtered" ? clearUiFilters : undefined}
            />
          ) : (
            <div className={cn(showSplit && "min-h-0 flex-1 overflow-hidden")}>
              <SplitDetailLayout
                showSplit={showSplit}
                nested
                list={
                  <SplitListColumn
                    showSplit={showSplit}
                    nested
                    showListLabel
                    listLabel={
                      <>
                        Échanges ({filtered.length})
                        {!showSplit && isWideLayout && (
                          <span className="font-normal normal-case text-muted-foreground/80">
                            {" "}
                            — cliquez une ligne pour le détail
                          </span>
                        )}
                      </>
                    }
                  >
                    <InteractionsGroupedList
                      groups={grouped}
                      showSplit={showSplit}
                      selectedEntry={selectedEntry}
                      onSelect={openEntry}
                    />
                  </SplitListColumn>
                }
                detail={
                  showSplit && selectedEntry ? (
                    <SplitDetailPane nested>
                      <ExchangeHistoryDetailPanel
                        embedded
                        {...detailPanelProps(selectedEntry)}
                      />
                    </SplitDetailPane>
                  ) : null
                }
              />
            </div>
          )}
        </CardContent>
      </Card>

      {!isWideLayout && selectedEntry && (
        <div id="interaction-detail-panel">
          <ExchangeHistoryDetailPanel {...detailPanelProps(selectedEntry)} />
        </div>
      )}

      <InteractionForm
        open={showForm}
        onOpenChange={setShowForm}
        interaction={editing}
        defaultContactId={
          contactFilterId ?? selectedEntry?.contact_id ?? undefined
        }
        onSuccess={() => void load()}
      />

      {contactDetailSheet}
    </div>
  );
}
