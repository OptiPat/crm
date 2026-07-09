import { useCallback, useEffect, useRef, useState, useMemo } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Filter, Users2, Tag, Download } from "lucide-react";
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
import { getAllContacts, deleteContact, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { getAlertesNonTraitees } from "@/lib/api/tauri-alertes";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";
import { buildPatrimoineMaps } from "@/lib/investissements/bulk-patrimoine";
import { useAppNavigationListener } from "@/hooks/useAppNavigationListener";
import { requestOpenContact } from "@/lib/navigation/app-navigation";
import { downloadCsvFile } from "@/lib/export/csv-export";
import { buildContactsCsv } from "@/lib/export/contacts-csv";
import { getAllEtiquettes, getAllContactEtiquettesDetails, type ContactEtiquetteDetails, type Etiquette } from "@/lib/api/tauri-etiquettes";
import { getAllSegments, getContactsMatchingSegment, type Segment } from "@/lib/api/tauri-segments";
import { groupEtiquettesByContactId } from "@/lib/etiquettes/etiquette-condition-labels";
import { buildEtiquettesPourFiltre } from "@/lib/etiquettes/etiquettes-filter";
import { subscribeEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { buildFoyerFlatRows } from "@/lib/foyers/foyer-list-rows";
import { VirtualizedContactList } from "@/components/contacts/VirtualizedContactList";
import { contactToUpdatePayload } from "@/lib/contacts/contact-form-utils";
import { estimateContactListRowHeight } from "@/lib/contacts/contact-list-row-height";
import { VirtualizedFoyerContactList } from "@/components/contacts/VirtualizedFoyerContactList";
import { FoyerFlatRowRenderer } from "@/components/contacts/FoyerFlatRowRenderer";
import { ContactListRow } from "@/components/contacts/ContactListRow";
import { FoyerGroupCard } from "@/components/contacts/FoyerGroupCard";
import { ContactsPageHeader } from "@/components/contacts/ContactsPageHeader";
import { ContactsActiveFilters } from "@/components/contacts/ContactsActiveFilters";
import { ContactsEmptyState } from "@/components/contacts/ContactsEmptyState";
import { ContactForm } from "@/components/contacts/ContactForm";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { ContactImport } from "@/components/contacts/ContactImport";
import { FinzzleClientsImportDialog } from "@/components/contacts/FinzzleClientsImportDialog";
import { MonOrganisationImportDialog } from "@/components/contacts/MonOrganisationImportDialog";
import { ImmoCommandesImportDialog } from "@/components/investissements/ImmoCommandesImportDialog";
import { PlacementCommandesImportDialog } from "@/components/investissements/PlacementCommandesImportDialog";
import { ContactDeduplicate } from "@/components/contacts/ContactDeduplicate";
import { ErrorBoundary } from "@/components/contacts/ErrorBoundary";
import { contactMatchesSearch } from "@/lib/search-utils";
import { compareContactsAlphabetically } from "@/lib/contacts/contact-sort";
import { loadContactsUiState, saveContactsUiState } from "@/lib/contacts/contacts-session";
import {
  getContactsListInitialState,
  appendContactToListCache,
  patchContactInListCache,
  patchFoyersInListCache,
  removeContactFromListCache,
  setContactsListCache,
} from "@/lib/contacts/contacts-list-cache";
import type { ContactsChangedDetail } from "@/lib/contacts/contact-events";
import { useContactsAutoRefresh } from "@/hooks/useContactsAutoRefresh";
import {
  beginRefreshGeneration,
  isRefreshGenerationCurrent,
} from "@/lib/refresh-generation";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import {
  armContactInvestissementFormOnDetail,
  consumePendingOpenContactId,
} from "@/lib/investissements/investissement-navigation";
import { consumeContactsNavigationFilter } from "@/lib/navigation/contacts-navigation";
import type { ContactsNavigationFilter } from "@/lib/navigation/contacts-navigation";
import {
  contactMatchesPipelineStage,
  CONTACTS_PIPELINE_STAGE_LABELS,
  type ContactsPipelineStage,
} from "@/lib/contacts/contacts-pipeline-match";
import {
  contactMatchesClientSubTab,
  countContactCategories,
  normalizeClientSubTab,
  type ClientSubTab,
  type FilleulSubTab,
} from "@/lib/contacts/contacts-category-match";
import { formatStatutSuiviLabel } from "@/lib/contacts/contact-form-utils";
import {
  SplitDetailLayout,
  SplitDetailPane,
  splitCardClassName,
  splitCardContentClassName,
  splitCardHeaderClassName,
} from "@/components/layout";
import { toast } from "sonner";

type MainTab = "clients" | "filleuls";

const STATUT_LABELS: Record<string, string> = {
  ALL: "Tous statuts",
  ACTIF: "Actifs",
  EN_PAUSE: formatStatutSuiviLabel("EN_PAUSE"),
  ARCHIVE: formatStatutSuiviLabel("ARCHIVE"),
};

interface ContactsProps {
  onNavigate?: (page: string) => void;
}

export function Contacts({ onNavigate }: ContactsProps) {
  const [initialListState] = useState(() => getContactsListInitialState());
  const [contacts, setContacts] = useState<Contact[]>(initialListState.contacts);
  const [foyers, setFoyers] = useState<Foyer[]>(initialListState.foyers);
  const [loading, setLoading] = useState(initialListState.loading);
  const [searchQuery, setSearchQuery] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("clients");
  const [clientSubTab, setClientSubTab] = useState<ClientSubTab>("CLIENT");
  const [filleulSubTab, setFilleulSubTab] = useState<FilleulSubTab>("FILLEUL");
  const [statutFilter, setStatutFilter] = useState<string>("ALL");
  const [etiquetteFilter, setEtiquetteFilter] = useState<string>("ALL");
  const [segmentFilter, setSegmentFilter] = useState<string>("ALL");
  const [segmentsDisponibles, setSegmentsDisponibles] = useState<Segment[]>([]);
  const [segmentContactIds, setSegmentContactIds] = useState<Set<number>>(new Set());
  const [etiquettesDisponibles, setEtiquettesDisponibles] = useState<Etiquette[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportLegacy, setShowImportLegacy] = useState(false);
  const [showImportFilleuls, setShowImportFilleuls] = useState(false);
  const [showImmoImport, setShowImmoImport] = useState(false);
  const [showPlacementImport, setShowPlacementImport] = useState(false);
  const [showDeduplicate, setShowDeduplicate] = useState(false);
  const [showDeleteAllDialog, setShowDeleteAllDialog] = useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [groupByFoyer, setGroupByFoyer] = useState(false);
  const [etiquettesParContact, setEtiquettesParContact] = useState<Record<number, ContactEtiquetteDetails[]>>({});
  const [needsFollowupOnly, setNeedsFollowupOnly] = useState(false);
  const [pipelineStageFilter, setPipelineStageFilter] = useState<ContactsPipelineStage | null>(
    null
  );
  const [alertContactIds, setAlertContactIds] = useState<Set<number>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingOpenContactIdRef = useRef<number | null>(null);
  const contactsRefreshGenRef = useRef(0);

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  const applyContactsNavIntent = useCallback((filter: ContactsNavigationFilter | null) => {
    if (!filter) return;
    setSearchQuery("");
    setStatutFilter("ALL");
    setEtiquetteFilter("ALL");
    setSegmentFilter("ALL");
    setNeedsFollowupOnly(false);

    if (filter.kind === "pipeline") {
      setPipelineStageFilter(filter.stage);
      setMainTab("clients");
      setClientSubTab("CLIENT");
      return;
    }

    if (filter.kind === "category") {
      setPipelineStageFilter(null);
      if (filter.mainTab === "clients" && "clientSubTab" in filter) {
        setMainTab("clients");
        setClientSubTab(filter.clientSubTab);
      } else if (filter.mainTab === "filleuls" && "filleulSubTab" in filter) {
        setMainTab("filleuls");
        setFilleulSubTab(filter.filleulSubTab);
      }
    }
  }, []);

  useEffect(() => {
    const stored = loadContactsUiState();
    if (stored) {
      if (stored.mainTab) setMainTab(stored.mainTab);
      if (stored.clientSubTab) {
        const normalized = normalizeClientSubTab(stored.clientSubTab);
        if (normalized) setClientSubTab(normalized);
      }
      if (stored.filleulSubTab) setFilleulSubTab(stored.filleulSubTab);
      if (stored.statutFilter) setStatutFilter(stored.statutFilter);
      if (stored.etiquetteFilter) setEtiquetteFilter(stored.etiquetteFilter);
      if (stored.segmentFilter) setSegmentFilter(stored.segmentFilter);
      if (stored.groupByFoyer != null) setGroupByFoyer(stored.groupByFoyer);
    }
    applyContactsNavIntent(consumeContactsNavigationFilter());
    setSessionHydrated(true);
  }, [applyContactsNavIntent]);

  useEffect(() => {
    if (!sessionHydrated) return;
    saveContactsUiState({
      mainTab,
      clientSubTab,
      filleulSubTab,
      statutFilter,
      etiquetteFilter,
      segmentFilter,
      groupByFoyer,
    });
  }, [
    sessionHydrated,
    mainTab,
    clientSubTab,
    filleulSubTab,
    statutFilter,
    etiquetteFilter,
    segmentFilter,
    groupByFoyer,
  ]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const loadAlertContactIds = useCallback(async () => {
    try {
      const alertes = await getAlertesNonTraitees();
      setAlertContactIds(new Set(alertes.map((a) => a.contact_id)));
    } catch {
      setAlertContactIds(new Set());
    }
  }, []);

  const loadContacts = useCallback(async (options?: {
    silent?: boolean;
    detail?: ContactsChangedDetail;
  }) => {
    const silent = options?.silent ?? false;
    const detail = options?.detail;

    if (detail?.patchedContact?.id) {
      beginRefreshGeneration(contactsRefreshGenRef);
      const contact = detail.patchedContact;
      patchContactInListCache(contact);
      setContacts((prev) => prev.map((c) => (c.id === contact.id ? contact : c)));
      setSelectedContact((prev) => (prev?.id === contact.id ? contact : prev));
      setLoading(false);
      setIsInitialLoad(false);
      return;
    }

    if (detail?.removedContactId != null) {
      beginRefreshGeneration(contactsRefreshGenRef);
      const token = contactsRefreshGenRef.current;
      const id = detail.removedContactId;
      removeContactFromListCache(id);
      setContacts((prev) => prev.filter((c) => c.id !== id));
      setEtiquettesParContact((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
      try {
        const dataFoyers = await getAllFoyers();
        if (!isRefreshGenerationCurrent(contactsRefreshGenRef, token)) return;
        setFoyers(dataFoyers);
        patchFoyersInListCache(dataFoyers);
      } catch (error) {
        console.error("Error refreshing foyers after delete:", error);
      }
      setLoading(false);
      setIsInitialLoad(false);
      return;
    }

    const token = beginRefreshGeneration(contactsRefreshGenRef);
    try {
      const [dataContacts, dataFoyers] = await Promise.all([
        getAllContacts(),
        getAllFoyers(),
      ]);
      if (!isRefreshGenerationCurrent(contactsRefreshGenRef, token)) return;
      setContacts(dataContacts);
      setFoyers(dataFoyers);
      setContactsListCache({ contacts: dataContacts, foyers: dataFoyers });
      setSelectedContact((prev) => {
        if (!prev?.id) return prev;
        return dataContacts.find((c) => c.id === prev.id) ?? prev;
      });
      setLoading(false);
      setIsInitialLoad(false);
    } catch (error) {
      if (!isRefreshGenerationCurrent(contactsRefreshGenRef, token)) return;
      if (isInitialLoad && error instanceof Error && error.message.includes("Invalid column type")) {
        setTimeout(() => void loadContacts(options), 500);
      } else {
        console.error("Error loading contacts:", error);
        if (!silent) setLoading(false);
        setIsInitialLoad(false);
      }
    }
  }, [isInitialLoad]);

  useEffect(() => {
    void loadContacts({ silent: initialListState.hasCache });
  }, [loadContacts, initialListState.hasCache]);

  useEffect(() => {
    void loadAlertContactIds();
  }, [loadAlertContactIds]);

  useContactsAutoRefresh(loadContacts, loadAlertContactIds);

  useEffect(() => {
    const id = consumePendingOpenContactId();
    if (id != null) pendingOpenContactIdRef.current = id;
  }, []);

  useEffect(() => {
    if (loading || contacts.length === 0) return;
    const id = pendingOpenContactIdRef.current;
    if (id == null) return;

    const contact = contacts.find((c) => c.id === id);
    pendingOpenContactIdRef.current = null;

    if (contact) {
      setSelectedContact(contact);
      setShowDetail(true);
    } else if (selectedContact?.id !== id) {
      toast.error("Contact introuvable — il a peut-être été supprimé.");
    }
  }, [loading, contacts, selectedContact?.id]);

  // Calcul des compteurs par catégorie
  // categorie = statut commercial (CLIENT, PROSPECT_CLIENT, SUSPECT_CLIENT)
  // filleul_categorie = statut réseau filleul (FILLEUL, PROSPECT_FILLEUL, etc.) - INDÉPENDANT
  const categoryCounts = useMemo(() => countContactCategories(contacts), [contacts]);

  // Déterminer la catégorie active selon l'onglet sélectionné
  const currentCategorie = mainTab === "clients" ? clientSubTab : filleulSubTab;
  const isFilleulTab = mainTab === "filleuls";

  const filteredContacts = contacts
    .filter((contact) => {
      // Filtre de recherche textuelle
      const matchesSearch = contactMatchesSearch(searchQuery, contact);

      // Filtre par catégorie - LOGIQUE INDÉPENDANTE (ou vue pipeline dashboard)
      let matchesCategorie = false;
      if (pipelineStageFilter) {
        matchesCategorie = contactMatchesPipelineStage(contact, pipelineStageFilter);
      } else if (isFilleulTab) {
        matchesCategorie = contact.filleul_categorie === currentCategorie;
      } else {
        matchesCategorie = contactMatchesClientSubTab(contact, clientSubTab);
      }

      // Filtre par statut
      const matchesStatut =
        statutFilter === "ALL" || contact.statut_suivi === statutFilter;

      // Filtre par étiquette
      const matchesEtiquette = etiquetteFilter === "ALL" || (
        contact.id && 
        etiquettesParContact[contact.id]?.some(e => e.etiquette_id.toString() === etiquetteFilter)
      );

      const matchesSegment =
        segmentFilter === "ALL" ||
        (contact.id != null && segmentContactIds.has(contact.id));

      const matchesFollowup =
        !needsFollowupOnly ||
        (contact.id != null && alertContactIds.has(contact.id));

      return (
        matchesSearch &&
        matchesCategorie &&
        matchesStatut &&
        matchesEtiquette &&
        matchesSegment &&
        matchesFollowup
      );
    })
    .sort(compareContactsAlphabetically);

  // Groupement par foyer
  const contactsGroupedByFoyer = useMemo(() => {
    if (!groupByFoyer) return null;

    const grouped: Record<string, { foyer: Foyer | null; contacts: Contact[]; patrimoine: number }> = {};

    filteredContacts.forEach((contact) => {
      const key = contact.foyer_id ? `foyer_${contact.foyer_id}` : `no_foyer_${contact.id}`;

      if (!grouped[key]) {
        const foyer = contact.foyer_id
          ? foyers.find((f) => Number(f.id) === Number(contact.foyer_id)) || null
          : null;
        grouped[key] = {
          foyer,
          contacts: [],
          patrimoine: 0,
        };
      }

      grouped[key].contacts.push(contact);
    });

    for (const group of Object.values(grouped)) {
      group.contacts.sort(compareContactsAlphabetically);
    }

    // Calculer le patrimoine de chaque groupe (on va le faire en asynchrone après)
    return Object.values(grouped).sort((a, b) => {
      // Les foyers en premier, puis les contacts sans foyer
      if (a.foyer && !b.foyer) return -1;
      if (!a.foyer && b.foyer) return 1;
      // Tri par nom de foyer ou contact isolé
      if (a.foyer && b.foyer) {
        return a.foyer.nom.localeCompare(b.foyer.nom, "fr", { sensitivity: "base" });
      }
      const ca = a.contacts[0];
      const cb = b.contacts[0];
      if (ca && cb) return compareContactsAlphabetically(ca, cb);
      return 0;
    });
  }, [filteredContacts, foyers, groupByFoyer]);

  // Calculer le patrimoine de chaque contact/foyer (total + avec moi)
  const [patrimoines, setPatrimoines] = useState<Record<string, number>>({});
  const [patrimoinesAvecMoi, setPatrimoinesAvecMoi] = useState<Record<string, number>>({});

  const foyerFlatRows = useMemo(() => {
    if (!contactsGroupedByFoyer) return [];
    return buildFoyerFlatRows(contactsGroupedByFoyer, patrimoines);
  }, [contactsGroupedByFoyer, patrimoines]);

  const useFoyerVirtual = groupByFoyer && foyerFlatRows.length > 80;

  useEffect(() => {
    if (contacts.length === 0) {
      setPatrimoines({});
      setPatrimoinesAvecMoi({});
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const allInv = await getAllInvestissements();
        if (cancelled) return;
        const maps = buildPatrimoineMaps(contacts, foyers, allInv);
        setPatrimoines(maps.patrimoines);
        setPatrimoinesAvecMoi(maps.patrimoinesAvecMoi);
      } catch {
        if (!cancelled) {
          setPatrimoines({});
          setPatrimoinesAvecMoi({});
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contacts, foyers]);

  const reloadEtiquettesAttributions = useCallback(async () => {
    try {
      const [all, segs, rows] = await Promise.all([
        getAllEtiquettes(),
        getAllSegments(),
        contacts.length > 0
          ? getAllContactEtiquettesDetails()
          : Promise.resolve([]),
      ]);
      setSegmentsDisponibles(segs);
      const grouped =
        rows.length > 0
          ? (groupEtiquettesByContactId(rows) as Record<
              number,
              ContactEtiquetteDetails[]
            >)
          : {};
      setEtiquettesParContact(grouped);
      setEtiquettesDisponibles(buildEtiquettesPourFiltre(all, grouped));
    } catch {
      setEtiquettesParContact({});
    }
  }, [contacts.length]);

  useEffect(() => {
    void reloadEtiquettesAttributions();
  }, [reloadEtiquettesAttributions]);

  useEffect(() => {
    return subscribeEtiquettesChanged(() => {
      void reloadEtiquettesAttributions();
    });
  }, [reloadEtiquettesAttributions]);

  useEffect(() => {
    if (segmentFilter === "ALL") {
      setSegmentContactIds(new Set());
      return;
    }
    const id = parseInt(segmentFilter, 10);
    if (Number.isNaN(id)) return;
    getContactsMatchingSegment(id)
      .then((list) => {
        const ids = new Set<number>();
        for (const c of list) {
          if (c.id != null) ids.add(c.id);
        }
        setSegmentContactIds(ids);
      })
      .catch(() => setSegmentContactIds(new Set()));
  }, [segmentFilter]);

  const isWideLayout = useMediaQuery("(min-width: 1024px)");
  /** Grand écran : split liste / fiche latérale pleine hauteur */
  const showSplit = isWideLayout && selectedContact != null;

  const openContactDetail = useCallback(
    (contact: Contact) => {
      setSelectedContact(contact);
      if (!isWideLayout) setShowDetail(true);
    },
    [isWideLayout]
  );

  useAppNavigationListener(
    (detail) => {
      if (detail.type === "page" && detail.page === "contacts") {
        applyContactsNavIntent(consumeContactsNavigationFilter());
        return;
      }
      if (detail.type !== "open-contact") return;
      const contact = contacts.find((c) => c.id === detail.contactId);
      if (contact) {
        openContactDetail(contact);
      } else {
        pendingOpenContactIdRef.current = detail.contactId;
      }
    },
    [contacts, openContactDetail, applyContactsNavIntent]
  );

  const openLinkedContact = useCallback(
    (linked: Contact) => {
      if (onNavigate && linked.id) {
        requestOpenContact(linked.id, {
          setCurrentPage: onNavigate,
          currentPage: "contacts",
        });
      } else {
        openContactDetail(linked);
      }
    },
    [onNavigate, openContactDetail]
  );

  const handleExportCsv = () => {
    const date = new Date().toISOString().slice(0, 10);
    downloadCsvFile(
      `contacts_${date}.csv`,
      buildContactsCsv(
        filteredContacts,
        foyers,
        patrimoines,
        patrimoinesAvecMoi,
        etiquettesParContact
      )
    );
    toast.success(`${filteredContacts.length} contact(s) exporté(s)`);
  };

  const closeContactDetail = () => {
    setSelectedContact(null);
    setShowDetail(false);
  };

  const handleDeleteContact = async (id: number) => {
    try {
      await deleteContact(id);
      if (selectedContact?.id === id) {
        closeContactDetail();
      }
    } catch (error) {
      console.error("Error deleting contact:", error);
      toast.error("Erreur lors de la suppression: " + String(error));
    }
  };

  const handleDeleteAllContacts = async () => {
    const isClients = mainTab === "clients";
    const contactsToDelete = filteredContacts;
    const typeLabel = isClients ? "clients" : "filleuls";

    if (contactsToDelete.length === 0) {
      toast.error(`Aucun ${typeLabel} à supprimer`);
      return;
    }

    try {
      let deleted = 0;
      let cleared = 0;

      if (isClients) {
        // 🔥 Suppression des CLIENTS : logique spéciale pour protéger les filleuls
        for (const contact of contactsToDelete) {
          if (contact.filleul_categorie) {
            // Ce contact est aussi un filleul → juste effacer categorie (mettre AUCUN)
            // 🔥 Ne pas spreader ...contact pour éviter les FK invalides
            await updateContact(
              contact.id!,
              contactToUpdatePayload(contact, {
                categorie: "AUCUN",
                date_dernier_contact: undefined,
                date_prochain_suivi: undefined,
              })
            );
            cleared++;
          } else {
            // Ce contact n'est PAS un filleul → supprimer le contact
            await deleteContact(contact.id!);
            deleted++;
          }
        }
        const message = cleared > 0 
          ? `${deleted} ${typeLabel} supprimé(s), ${cleared} conservé(s) (aussi filleuls)`
          : `${deleted} ${typeLabel} supprimé(s)`;
        toast.success(message);
      } else {
        // 🔥 Suppression des FILLEULS : logique spéciale pour protéger les clients
        for (const contact of contactsToDelete) {
          if (contact.categorie === "CLIENT" || 
              contact.categorie === "PROSPECT_CLIENT" || 
              contact.categorie === "SUSPECT_CLIENT") {
            // Ce contact est aussi un client → juste effacer filleul_categorie + dates filleul
            // 🔥 Ne pas spreader ...contact pour éviter les FK invalides
            await updateContact(
              contact.id!,
              contactToUpdatePayload(contact, {
                filleul_categorie: undefined,
                parrain_id: undefined,
                date_dernier_contact_filleul: undefined,
                date_prochain_suivi_filleul: undefined,
              })
            );
            cleared++;
          } else {
            // Ce contact n'est PAS un client → supprimer le contact
            await deleteContact(contact.id!);
            deleted++;
          }
        }
        
        if (cleared > 0 && deleted > 0) {
          toast.success(
            `${deleted} filleul(s) supprimé(s), ${cleared} client(s) conservé(s) (statut filleul effacé)`
          );
        } else if (cleared > 0) {
          toast.success(`${cleared} client(s) conservé(s) (statut filleul effacé)`);
        } else {
          toast.success(`${deleted} filleul(s) supprimé(s)`);
        }
      }
    } catch (error) {
      console.error("Error deleting contacts:", error);
      toast.error("Erreur lors de la suppression: " + String(error));
    }
  };

  const currentSubTab =
    mainTab === "clients" ? clientSubTab : filleulSubTab;
  const selectedEtiquette = etiquettesDisponibles.find(
    (e) => e.id.toString() === etiquetteFilter
  );
  const selectedSegment = segmentsDisponibles.find(
    (s) => s.id.toString() === segmentFilter
  );
  const hasExtraFilters =
    statutFilter !== "ALL" ||
    etiquetteFilter !== "ALL" ||
    segmentFilter !== "ALL" ||
    needsFollowupOnly ||
    !!searchQuery.trim();

  const listRowProps = {
    isFilleulTab,
    patrimoines,
    patrimoinesAvecMoi,
    etiquettesParContact,
    onView: openContactDetail,
  };

  return (
    <div
      className={cn(
        "mx-auto space-y-6 pb-8",
        showSplit ? "max-w-[1800px]" : "max-w-[1600px]"
      )}
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <ContactsPageHeader
          mainTab={mainTab}
          filteredCount={filteredContacts.length}
          onNewContact={() => setShowForm(true)}
          onImport={() =>
            mainTab === "filleuls" ? setShowImportFilleuls(true) : setShowImport(true)
          }
          onImportImmo={() => setShowImmoImport(true)}
          onImportPlacement={() => setShowPlacementImport(true)}
          onDeduplicate={() => setShowDeduplicate(true)}
          onDeleteAll={() => setShowDeleteAllDialog(true)}
        />
        {filteredContacts.length > 0 && (
          <Button
            variant="outline"
            className="gap-2 shrink-0"
            onClick={handleExportCsv}
          >
            <Download className="h-4 w-4" />
            Exporter CSV
          </Button>
        )}
      </div>

      <SplitDetailLayout
        showSplit={showSplit}
        list={
      <Card className={splitCardClassName(showSplit, "min-w-0 border-border/70 shadow-sm")}>
        <CardHeader className={splitCardHeaderClassName(showSplit)}>
          <div className="space-y-4">
            <div>
              <CardTitle className="font-serif">Liste des contacts</CardTitle>
              <CardDescription>
                {filteredContacts.length} résultat
                {filteredContacts.length > 1 ? "s" : ""}
                {pipelineStageFilter
                  ? ` · ${CONTACTS_PIPELINE_STAGE_LABELS[pipelineStageFilter]}`
                  : ""}
                {groupByFoyer ? " · regroupés par foyer" : ""}
              </CardDescription>
            </div>

            <Tabs
              value={mainTab}
              onValueChange={(value) => {
                setPipelineStageFilter(null);
                setMainTab(value as MainTab);
              }}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 h-auto">
                <TabsTrigger value="clients" className="gap-2 py-2.5">
                  Clients
                  <Badge variant="secondary" className="ml-1 tabular-nums">
                    {categoryCounts.CLIENT +
                      categoryCounts.CLIENT_ANCIEN +
                      categoryCounts.PROSPECT_CLIENT +
                      categoryCounts.SUSPECT_CLIENT}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="filleuls" className="gap-2 py-2.5">
                  Filleuls
                  <Badge variant="secondary" className="ml-1 tabular-nums">
                    {categoryCounts.FILLEUL +
                      categoryCounts.PROSPECT_FILLEUL +
                      categoryCounts.SUSPECT_FILLEUL +
                      categoryCounts.FILLEUL_DESINSCRIT}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              {/* Contenu onglet CLIENTS */}
              <TabsContent value="clients" className="space-y-4 mt-4">
                <Tabs
                  value={clientSubTab}
                  onValueChange={(value) => {
                    setPipelineStageFilter(null);
                    setClientSubTab(value as ClientSubTab);
                  }}
                >
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="CLIENT" className="gap-2">
                      Clients
                      <Badge variant="secondary" className="bg-green-50 text-green-700 border border-green-200">
                        {categoryCounts.CLIENT}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="PROSPECT_CLIENT" className="gap-2">
                      Prospects
                      <Badge variant="secondary" className="bg-blue-50 text-blue-700 border border-blue-200">
                        {categoryCounts.PROSPECT_CLIENT}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="SUSPECT_CLIENT" className="gap-2">
                      Suspects
                      <Badge variant="secondary" className="bg-yellow-50 text-yellow-700 border border-yellow-200">
                        {categoryCounts.SUSPECT_CLIENT}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="CLIENT_ANCIEN" className="gap-2">
                      Anciens clients
                      <Badge variant="secondary" className="bg-gray-50 text-gray-700 border border-gray-200">
                        {categoryCounts.CLIENT_ANCIEN}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </TabsContent>

              {/* Contenu onglet FILLEULS */}
              <TabsContent value="filleuls" className="space-y-4 mt-4">
                <Tabs
                  value={filleulSubTab}
                  onValueChange={(value) => {
                    setPipelineStageFilter(null);
                    setFilleulSubTab(value as FilleulSubTab);
                  }}
                >
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="FILLEUL" className="gap-2">
                      Filleuls
                      <Badge variant="secondary" className="bg-purple-50 text-purple-700 border border-purple-200">
                        {categoryCounts.FILLEUL}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="PROSPECT_FILLEUL" className="gap-2">
                      Prospects
                      <Badge variant="secondary" className="bg-cyan-50 text-cyan-700 border border-cyan-200">
                        {categoryCounts.PROSPECT_FILLEUL}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="SUSPECT_FILLEUL" className="gap-2">
                      Suspects
                      <Badge variant="secondary" className="bg-orange-50 text-orange-700 border border-orange-200">
                        {categoryCounts.SUSPECT_FILLEUL}
                      </Badge>
                    </TabsTrigger>
                    <TabsTrigger value="FILLEUL_DESINSCRIT" className="gap-2">
                      Désinscrits
                      <Badge variant="secondary" className="bg-gray-50 text-gray-700 border border-gray-200">
                        {categoryCounts.FILLEUL_DESINSCRIT}
                      </Badge>
                    </TabsTrigger>
                  </TabsList>
                </Tabs>
              </TabsContent>
            </Tabs>

            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 min-w-[200px] relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    ref={searchInputRef}
                    placeholder="Rechercher… (Ctrl+K)"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>

                <Select value={statutFilter} onValueChange={setStatutFilter}>
                  <SelectTrigger className="w-[180px]">
                    <Filter className="h-4 w-4 mr-2 shrink-0" />
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tous statuts</SelectItem>
                    <SelectItem value="ACTIF">Actifs</SelectItem>
                    <SelectItem value="EN_PAUSE">{formatStatutSuiviLabel("EN_PAUSE")}</SelectItem>
                    <SelectItem value="ARCHIVE">Archivés</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={etiquetteFilter} onValueChange={setEtiquetteFilter}>
                  <SelectTrigger className="w-[200px]">
                    <Tag className="h-4 w-4 mr-2 shrink-0 text-muted-foreground" />
                    <SelectValue placeholder="Étiquette" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Toutes étiquettes</SelectItem>
                    {etiquettesDisponibles.map((etiquette) => (
                      <SelectItem key={etiquette.id} value={etiquette.id.toString()}>
                        <span className="flex items-center gap-2">
                          <span
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: etiquette.couleur }}
                          />
                          {etiquette.nom}
                          {etiquette.actif === false ? " (inactive)" : ""}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                {segmentsDisponibles.length > 0 && (
                  <Select value={segmentFilter} onValueChange={setSegmentFilter}>
                    <SelectTrigger className="w-[200px]">
                      <Filter className="h-4 w-4 mr-2 shrink-0" />
                      <SelectValue placeholder="Groupe de contacts" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">Tous les groupes</SelectItem>
                      {segmentsDisponibles.map((s) => (
                        <SelectItem key={s.id} value={s.id.toString()}>
                          {s.nom}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}

                <Button
                  variant={groupByFoyer ? "default" : "outline"}
                  onClick={() => setGroupByFoyer(!groupByFoyer)}
                  className="gap-2 whitespace-nowrap"
                >
                  <Users2 className="h-4 w-4" />
                  {groupByFoyer ? "Vue liste" : "Par foyer"}
                </Button>
              </div>

              <ContactsActiveFilters
                searchQuery={searchQuery}
                onClearSearch={() => setSearchQuery("")}
                statutFilter={statutFilter}
                statutLabel={STATUT_LABELS[statutFilter] ?? statutFilter}
                onClearStatut={() => setStatutFilter("ALL")}
                etiquetteFilter={etiquetteFilter}
                etiquetteLabel={
                  selectedEtiquette
                    ? `Étiquette : ${selectedEtiquette.nom}`
                    : undefined
                }
                onClearEtiquette={() => setEtiquetteFilter("ALL")}
                segmentFilter={segmentFilter}
                segmentLabel={
                  selectedSegment ? `Groupe : ${selectedSegment.nom}` : undefined
                }
                onClearSegment={() => setSegmentFilter("ALL")}
                needsFollowupOnly={needsFollowupOnly}
                onToggleNeedsFollowup={() => setNeedsFollowupOnly((v) => !v)}
                followupCount={alertContactIds.size}
                pipelineStageLabel={
                  pipelineStageFilter
                    ? CONTACTS_PIPELINE_STAGE_LABELS[pipelineStageFilter]
                    : undefined
                }
                onClearPipelineStage={() => setPipelineStageFilter(null)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className={splitCardContentClassName(showSplit, undefined, true)}>
          <div
            className={cn(
              showSplit && "flex min-h-0 flex-1 flex-col overflow-hidden"
            )}
          >
          {loading ? (
            <div className="space-y-2 py-4">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-20 rounded-xl bg-muted/50 animate-pulse" />
              ))}
            </div>
          ) : filteredContacts.length === 0 ? (
            <ContactsEmptyState
              hasSearch={!!searchQuery.trim()}
              hasFilters={hasExtraFilters}
              mainTab={mainTab}
              subTab={currentSubTab}
              onCreate={() => setShowForm(true)}
              onImport={() =>
                mainTab === "filleuls" ? setShowImportFilleuls(true) : setShowImport(true)
              }
            />
          ) : groupByFoyer && contactsGroupedByFoyer ? (
            useFoyerVirtual ? (
              <div
                className={cn(
                  "rounded-xl border border-border/70 divide-y divide-border overflow-hidden",
                  showSplit && "min-h-0 flex-1"
                )}
              >
                <VirtualizedFoyerContactList
                  rows={foyerFlatRows}
                  pageScroll={!showSplit}
                  fillParent={showSplit}
                  renderRow={(row) => (
                    <FoyerFlatRowRenderer
                      row={row}
                      isFilleulTab={isFilleulTab}
                      patrimoines={patrimoines}
                      patrimoinesAvecMoi={patrimoinesAvecMoi}
                      etiquettesParContact={etiquettesParContact}
                      onViewContact={openContactDetail}
                      selectedContactId={selectedContact?.id}
                      renderEtiquettes={() => null}
                      renderMeta={() => null}
                    />
                  )}
                />
              </div>
            ) : (
              <div className={cn("space-y-4", showSplit && "min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
                {contactsGroupedByFoyer.map((group, groupIndex) => (
                  <FoyerGroupCard
                    key={group.foyer?.id ?? `solo-${groupIndex}`}
                    group={group}
                    isFilleulTab={isFilleulTab}
                    patrimoines={patrimoines}
                    patrimoinesAvecMoi={patrimoinesAvecMoi}
                    etiquettesParContact={etiquettesParContact}
                    onViewContact={openContactDetail}
                    selectedContactId={selectedContact?.id}
                    defaultCollapsed={groupIndex > 2}
                  />
                ))}
              </div>
            )
          ) : filteredContacts.length > 80 ? (
            <VirtualizedContactList
              items={filteredContacts}
              pageScroll={!showSplit}
              fillParent={showSplit}
              getKey={(contact) => contact.id ?? `${contact.nom}-${contact.prenom}`}
              getItemHeight={(contact) =>
                estimateContactListRowHeight(contact, etiquettesParContact)
              }
              renderItem={(contact) => (
                <ContactListRow
                  contact={contact}
                  {...listRowProps}
                  selected={selectedContact?.id === contact.id}
                  variant="card"
                />
              )}
              className={cn("pr-1", showSplit && "min-h-0 flex-1")}
            />
          ) : (
            <div className={cn("space-y-2", showSplit && "min-h-0 flex-1 overflow-y-auto overscroll-contain")}>
              {filteredContacts.map((contact) => (
                <ContactListRow
                  key={contact.id}
                  contact={contact}
                  {...listRowProps}
                  selected={selectedContact?.id === contact.id}
                  variant="card"
                />
              ))}
            </div>
          )}
          </div>
        </CardContent>
      </Card>
        }
        detail={
          selectedContact ? (
            <SplitDetailPane>
              <ContactDetail
                key={selectedContact.id}
                embedded
                open
                contact={selectedContact}
                onOpenChange={(open) => {
                  if (!open) closeContactDetail();
                }}
                onDelete={handleDeleteContact}
                onContactRefreshed={(updated) => {
                  setSelectedContact(updated);
                  setContacts((prev) =>
                    prev.map((c) => (c.id === updated.id ? updated : c))
                  );
                  patchContactInListCache(updated);
                }}
                onNavigate={onNavigate}
                onOpenContact={openLinkedContact}
              />
            </SplitDetailPane>
          ) : null
        }
      />

      {/* Formulaire de création */}
      <ContactForm
        open={showForm}
        onOpenChange={setShowForm}
        onCreated={(contact, { addInvestissement }) => {
          if (!contact.id) return;
          setContacts((prev) => {
            if (prev.some((c) => c.id === contact.id)) return prev;
            const next = [...prev, contact];
            setContactsListCache({ contacts: next, foyers });
            return next;
          });
          appendContactToListCache(contact);
          pendingOpenContactIdRef.current = null;
          if (!addInvestissement) return;
          armContactInvestissementFormOnDetail();
          openContactDetail(contact);
        }}
        createContext={mainTab === "filleuls" ? "filleuls" : "clients"}
        onOpenContact={openLinkedContact}
      />

      {/* Import contacts — export Finzzle */}
      <ErrorBoundary>
        <FinzzleClientsImportDialog
          open={showImport}
          onOpenChange={setShowImport}
          onApplied={() => void loadContacts()}
          onOpenLegacyImport={() => setShowImportLegacy(true)}
        />
      </ErrorBoundary>

      {/* Import Excel personnalisé (mapping manuel, investissements…) */}
      <ErrorBoundary>
        <ContactImport
          open={showImportLegacy}
          onOpenChange={setShowImportLegacy}
        />
      </ErrorBoundary>

      {/* Import filleuls — export Finzzle Mon Organisation */}
      <ErrorBoundary>
        <MonOrganisationImportDialog
          open={showImportFilleuls}
          onOpenChange={setShowImportFilleuls}
          onApplied={() => void loadContacts()}
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <ImmoCommandesImportDialog
          open={showImmoImport}
          onOpenChange={setShowImmoImport}
        />
      </ErrorBoundary>

      <ErrorBoundary>
        <PlacementCommandesImportDialog
          open={showPlacementImport}
          onOpenChange={setShowPlacementImport}
        />
      </ErrorBoundary>

      {/* Déduplication */}
      <ContactDeduplicate
        open={showDeduplicate}
        onOpenChange={setShowDeduplicate}
      />

      {/* Fiche détaillée (mobile / fenêtre étroite) */}
      {!isWideLayout && selectedContact && (
        <ContactDetail
          key={selectedContact.id}
          open={showDetail}
          onOpenChange={(open) => {
            setShowDetail(open);
            if (!open) setSelectedContact(null);
          }}
          contact={selectedContact}
          onDelete={handleDeleteContact}
          onContactRefreshed={(updated) => {
            setSelectedContact(updated);
            setContacts((prev) =>
              prev.map((c) => (c.id === updated.id ? updated : c))
            );
            patchContactInListCache(updated);
          }}
          onNavigate={onNavigate}
          onOpenContact={openLinkedContact}
        />
      )}

      <AlertDialog
        open={showDeleteAllDialog}
        onOpenChange={(open) => !deleteAllBusy && setShowDeleteAllDialog(open)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Supprimer tous les {mainTab === "clients" ? "clients" : "filleuls"} ?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-left space-y-2">
              <span className="block">
                Vous allez supprimer{" "}
                <strong>{filteredContacts.length}</strong>{" "}
                {mainTab === "clients" ? "client" : "filleul"}
                {filteredContacts.length > 1 ? "s" : ""} de la vue actuelle
                {hasExtraFilters ? " (filtres appliqués)" : ""}.
              </span>
              <span className="block text-destructive">
                Cette action est irréversible. Les contacts aussi filleuls ou clients
                seront conservés avec leur autre statut effacé.
              </span>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteAllBusy}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteAllBusy}
              onClick={(e) => {
                e.preventDefault();
                setDeleteAllBusy(true);
                void handleDeleteAllContacts()
                  .finally(() => {
                    setDeleteAllBusy(false);
                    setShowDeleteAllDialog(false);
                  });
              }}
            >
              {deleteAllBusy ? "Suppression…" : "Supprimer tout"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
