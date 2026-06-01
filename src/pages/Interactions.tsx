import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Plus, Search, X } from "lucide-react";
import { useInteractionsAutoRefresh } from "@/hooks/useInteractionsAutoRefresh";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { toast } from "sonner";
import {
  deleteInteraction,
  INTERACTION_TYPES,
  type ExchangeHistoryEntry,
  type InteractionWithContact,
} from "@/lib/api/tauri-interactions";
import { InteractionForm } from "@/components/interactions/InteractionForm";
import { ExchangeHistoryListRow } from "@/components/interactions/ExchangeHistoryListRow";
import { ExchangeHistoryDetailPanel } from "@/components/interactions/ExchangeHistoryDetailPanel";
import { InteractionsPageHeader } from "@/components/interactions/InteractionsPageHeader";
import {
  consumeInteractionsContactFocus,
  setInteractionsContactFocus,
} from "@/lib/navigation/interactions-navigation";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import {
  exchangeContactName,
  exchangeEntryKey,
  isEmailCampaignEntry,
  loadExchangeHistory,
  manualEntryToInteraction,
} from "@/lib/interactions/exchange-history-display";
import { getInteractionTypeLabel } from "@/lib/interactions/interaction-display";
import { cn } from "@/lib/utils";
import { textMatchesSearch } from "@/lib/search-utils";

interface InteractionsProps {
  currentPage?: string;
  onNavigate?: (page: string) => void;
  onOpenContact?: (contactId: number) => void;
}

export function Interactions({ onNavigate, onOpenContact }: InteractionsProps) {
  const [items, setItems] = useState<ExchangeHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<InteractionWithContact | null>(null);
  const [selectedEntry, setSelectedEntry] = useState<ExchangeHistoryEntry | null>(null);
  const [contactFilterId, setContactFilterId] = useState<number | null>(null);
  const focusConsumedRef = useRef(false);
  const contactFilterIdRef = useRef(contactFilterId);
  contactFilterIdRef.current = contactFilterId;

  const isWideLayout = useMediaQuery("(min-width: 1024px)");
  const showSplit = isWideLayout && selectedEntry != null;

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const contactId = contactFilterIdRef.current;
      const data = await loadExchangeHistory(
        contactId != null ? { contactId } : undefined
      );
      setItems(data);
      setSelectedEntry((prev) => {
        if (!prev) return prev;
        return data.find((e) => exchangeEntryKey(e) === exchangeEntryKey(prev)) ?? null;
      });
    } catch (error) {
      console.error(error);
      setLoadError(String(error));
      setItems([]);
      setSelectedEntry(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (focusConsumedRef.current) return;
    focusConsumedRef.current = true;
    const focusId = consumeInteractionsContactFocus();
    if (focusId != null) {
      setContactFilterId(focusId);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load, contactFilterId]);

  useAppNavigationListener((detail) => {
    if (detail.type !== "interactions") return;
    if (detail.contactId != null) {
      setInteractionsContactFocus(detail.contactId);
      setContactFilterId(detail.contactId);
    }
  }, []);

  useInteractionsAutoRefresh(load);

  const openContact = (contactId: number) => {
    if (onOpenContact) {
      onOpenContact(contactId);
    } else if (onNavigate) {
      sessionStorage.setItem("crm_open_contact_id", String(contactId));
      onNavigate("contacts");
    }
  };

  const filtered = useMemo(() => {
    return items.filter((item) => {
      if (contactFilterId != null && item.contact_id !== contactFilterId) {
        return false;
      }
      const typeValue = isEmailCampaignEntry(item)
        ? "EMAIL"
        : item.type_interaction ?? "AUTRE";
      const matchesType = typeFilter === "ALL" || typeValue === typeFilter;
      const matchesSearch = textMatchesSearch(
        searchQuery,
        item.contact_nom,
        item.contact_prenom,
        item.sujet,
        item.contenu,
        item.sent_subject,
        item.sent_template_nom,
        item.email_reponse_body,
        item.etiquette_nom,
        getInteractionTypeLabel(typeValue)
      );
      return matchesType && matchesSearch;
    });
  }, [items, searchQuery, typeFilter, contactFilterId]);

  useEffect(() => {
    if (loading || contactFilterId == null) return;
    if (items.length > 0 && filtered.length === 0) {
      setContactFilterId(null);
    }
  }, [loading, contactFilterId, items.length, filtered.length]);

  const contactFilterLabel = useMemo(() => {
    if (contactFilterId == null) return null;
    const match = items.find((i) => i.contact_id === contactFilterId);
    if (match) {
      return exchangeContactName(match);
    }
    return `Contact #${contactFilterId}`;
  }, [items, contactFilterId]);

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

      <Card className="border-border/70 shadow-sm min-w-0">
        <CardHeader className="pb-3">
          <CardTitle className="text-lg">Journal</CardTitle>
          <CardDescription>
            {items.length} échange{items.length !== 1 ? "s" : ""} enregistré
            {items.length !== 1 ? "s" : ""}
            {showSplit ? " — détail à droite (clic sur une ligne)" : ""}
          </CardDescription>
        </CardHeader>

        <CardContent className="pt-0 space-y-4">
          {contactFilterId != null && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-primary/25 bg-primary/5 px-3 py-2 text-sm">
              <span>
                Filtre contact : <strong>{contactFilterLabel}</strong>
              </span>
              <div className="flex gap-2">
                {(onOpenContact || onNavigate) && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => openContact(contactFilterId)}
                  >
                    Fiche contact
                  </Button>
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setContactFilterId(null);
                    setSearchQuery("");
                    setSelectedEntry(null);
                  }}
                >
                  Voir tout le journal
                </Button>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                className="pl-9"
                placeholder="Rechercher contact, sujet, contenu…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setSearchQuery("")}
                  aria-label="Effacer la recherche"
                >
                  <X className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-full sm:w-48">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les types</SelectItem>
                {INTERACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

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
            <div className="text-center py-12 rounded-xl border border-dashed border-border/80 bg-muted/15">
              <p className="text-muted-foreground mb-4">
                {items.length === 0
                  ? "Aucune interaction enregistrée"
                  : "Aucun résultat pour cette recherche"}
              </p>
              <Button onClick={startCreate}>
                <Plus className="h-4 w-4 mr-2" />
                Nouvelle interaction
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                "grid gap-4 items-start",
                showSplit && "lg:grid-cols-2"
              )}
            >
              <div
                className={cn(
                  "space-y-2 min-w-0",
                  showSplit &&
                    "lg:max-h-[calc(100vh-14rem)] lg:overflow-y-auto lg:pr-1"
                )}
              >
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide px-1 sticky top-0 bg-card z-10 py-2">
                  Échanges ({filtered.length})
                  {!showSplit && isWideLayout && (
                    <span className="normal-case font-normal text-muted-foreground/80">
                      {" "}
                      — cliquez une ligne pour le détail
                    </span>
                  )}
                </p>
                {filtered.map((entry) => (
                  <ExchangeHistoryListRow
                    key={exchangeEntryKey(entry)}
                    entry={entry}
                    compact={showSplit}
                    selected={
                      selectedEntry != null &&
                      exchangeEntryKey(selectedEntry) === exchangeEntryKey(entry)
                    }
                    onClick={() => openEntry(entry)}
                  />
                ))}
              </div>

              {showSplit && selectedEntry && (
                <div className="hidden lg:block min-w-0 lg:sticky lg:top-4 self-start w-full">
                  <ExchangeHistoryDetailPanel
                    embedded
                    entry={selectedEntry}
                    onClose={() => setSelectedEntry(null)}
                    onEdit={
                      !isEmailCampaignEntry(selectedEntry)
                        ? () => startEdit(selectedEntry)
                        : undefined
                    }
                    onDelete={
                      !isEmailCampaignEntry(selectedEntry)
                        ? () => void handleDelete(selectedEntry)
                        : undefined
                    }
                    onOpenContact={
                      onOpenContact || onNavigate
                        ? () => openContact(selectedEntry.contact_id)
                        : undefined
                    }
                    onRefresh={() => void load()}
                  />
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {!isWideLayout && selectedEntry && (
        <div id="interaction-detail-panel">
          <ExchangeHistoryDetailPanel
            entry={selectedEntry}
            onClose={() => setSelectedEntry(null)}
            onEdit={
              !isEmailCampaignEntry(selectedEntry)
                ? () => startEdit(selectedEntry)
                : undefined
            }
            onDelete={
              !isEmailCampaignEntry(selectedEntry)
                ? () => void handleDelete(selectedEntry)
                : undefined
            }
            onOpenContact={
              onOpenContact || onNavigate
                ? () => openContact(selectedEntry.contact_id)
                : undefined
            }
            onRefresh={() => void load()}
          />
        </div>
      )}

      <InteractionForm
        open={showForm}
        onOpenChange={setShowForm}
        interaction={editing}
        defaultContactId={
          contactFilterId ?? selectedEntry?.contact_id ?? undefined
        }
      />
    </div>
  );
}
