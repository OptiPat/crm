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
import { Search, Filter, Users2, Tag } from "lucide-react";
import { getAllContacts, deleteContact, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { getAlertesNonTraitees } from "@/lib/api/tauri-alertes";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import {
  getContactsForFoyer,
  loadFoyerPatrimoineCentimes,
} from "@/lib/foyers/foyer-utils";
import { getAllEtiquettes, getAllContactEtiquettesDetails, type ContactEtiquetteDetails, type Etiquette } from "@/lib/api/tauri-etiquettes";
import { groupEtiquettesByContactId } from "@/lib/etiquettes/etiquette-condition-labels";
import { buildEtiquettesPourFiltre } from "@/lib/etiquettes/etiquettes-filter";
import { subscribeEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";
import { buildFoyerFlatRows } from "@/lib/foyers/foyer-list-rows";
import { VirtualizedContactList } from "@/components/contacts/VirtualizedContactList";
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
import { ContactImportFilleuls } from "@/components/contacts/ContactImportFilleuls";
import { ContactDeduplicate } from "@/components/contacts/ContactDeduplicate";
import { ErrorBoundary } from "@/components/contacts/ErrorBoundary";
import { contactMatchesSearch } from "@/lib/search-utils";
import {
  getPrioriteContact,
  getPrioriteFilleul,
} from "@/lib/contacts/contact-priority";
import { loadContactsUiState, saveContactsUiState } from "@/lib/contacts/contacts-session";
import { useAppAutoRefresh } from "@/hooks/useAppAutoRefresh";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { cn } from "@/lib/utils";
import { consumePendingOpenContactId } from "@/lib/investissements/investissement-navigation";
import { toast } from "sonner";

type MainTab = "clients" | "filleuls";
type ClientSubTab = "CLIENT" | "PROSPECT_CLIENT" | "SUSPECT_CLIENT";
type FilleulSubTab = "FILLEUL" | "PROSPECT_FILLEUL" | "SUSPECT_FILLEUL" | "FILLEUL_DESINSCRIT";

const STATUT_LABELS: Record<string, string> = {
  ALL: "Tous statuts",
  ACTIF: "Actifs",
  EN_PAUSE: "En pause",
  ARCHIVE: "Archivés",
};

interface ContactsProps {
  onNavigate?: (page: string) => void;
}

export function Contacts({ onNavigate }: ContactsProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("clients");
  const [clientSubTab, setClientSubTab] = useState<ClientSubTab>("CLIENT");
  const [filleulSubTab, setFilleulSubTab] = useState<FilleulSubTab>("FILLEUL");
  const [statutFilter, setStatutFilter] = useState<string>("ALL");
  const [etiquetteFilter, setEtiquetteFilter] = useState<string>("ALL");
  const [etiquettesDisponibles, setEtiquettesDisponibles] = useState<Etiquette[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportFilleuls, setShowImportFilleuls] = useState(false);
  const [showDeduplicate, setShowDeduplicate] = useState(false);
  const [groupByFoyer, setGroupByFoyer] = useState(false);
  const [etiquettesParContact, setEtiquettesParContact] = useState<Record<number, ContactEtiquetteDetails[]>>({});
  const [needsFollowupOnly, setNeedsFollowupOnly] = useState(false);
  const [alertContactIds, setAlertContactIds] = useState<Set<number>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const pendingOpenContactIdRef = useRef<number | null>(null);

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [sessionHydrated, setSessionHydrated] = useState(false);

  useEffect(() => {
    const stored = loadContactsUiState();
    if (stored) {
      if (stored.mainTab) setMainTab(stored.mainTab);
      if (stored.clientSubTab) setClientSubTab(stored.clientSubTab);
      if (stored.filleulSubTab) setFilleulSubTab(stored.filleulSubTab);
      if (stored.statutFilter) setStatutFilter(stored.statutFilter);
      if (stored.etiquetteFilter) setEtiquetteFilter(stored.etiquetteFilter);
      if (stored.groupByFoyer != null) setGroupByFoyer(stored.groupByFoyer);
    }
    setSessionHydrated(true);
  }, []);

  useEffect(() => {
    if (!sessionHydrated) return;
    saveContactsUiState({
      mainTab,
      clientSubTab,
      filleulSubTab,
      statutFilter,
      etiquetteFilter,
      groupByFoyer,
    });
  }, [
    sessionHydrated,
    mainTab,
    clientSubTab,
    filleulSubTab,
    statutFilter,
    etiquetteFilter,
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

  useEffect(() => {
    void loadContacts();
    void loadAlertContactIds();
  }, []);

  useAppAutoRefresh(() => {
    void loadContacts();
    void loadAlertContactIds();
  });

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
    } else {
      toast.error("Contact introuvable — il a peut-être été supprimé.");
    }
  }, [loading, contacts]);

  const loadContacts = async () => {
    try {
      const [dataContacts, dataFoyers] = await Promise.all([
        getAllContacts(),
        getAllFoyers(),
      ]);
      setContacts(dataContacts);
      setFoyers(dataFoyers);
      setSelectedContact((prev) => {
        if (!prev?.id) return prev;
        return dataContacts.find((c) => c.id === prev.id) ?? prev;
      });
      setLoading(false);
      setIsInitialLoad(false);
    } catch (error) {
      // Si c'est le premier chargement et erreur de type de colonne, réessayer après un court délai
      if (isInitialLoad && error instanceof Error && error.message.includes("Invalid column type")) {
        setTimeout(loadContacts, 500);
      } else {
        console.error("Error loading contacts:", error);
        setLoading(false);
        setIsInitialLoad(false);
      }
    }
  };

  // Calcul des compteurs par catégorie
  // categorie = statut commercial (CLIENT, PROSPECT_CLIENT, SUSPECT_CLIENT)
  // filleul_categorie = statut réseau filleul (FILLEUL, PROSPECT_FILLEUL, etc.) - INDÉPENDANT
  const categoryCounts = useMemo(() => {
    return {
      // Clients - basé sur categorie
      CLIENT: contacts.filter(c => c.categorie === "CLIENT").length,
      PROSPECT_CLIENT: contacts.filter(c => c.categorie === "PROSPECT_CLIENT").length,
      SUSPECT_CLIENT: contacts.filter(c => c.categorie === "SUSPECT_CLIENT").length,
      // Filleuls - basé sur filleul_categorie (INDÉPENDANT de categorie)
      FILLEUL: contacts.filter(c => c.filleul_categorie === "FILLEUL").length,
      PROSPECT_FILLEUL: contacts.filter(c => c.filleul_categorie === "PROSPECT_FILLEUL").length,
      SUSPECT_FILLEUL: contacts.filter(c => c.filleul_categorie === "SUSPECT_FILLEUL").length,
      FILLEUL_DESINSCRIT: contacts.filter(c => c.filleul_categorie === "FILLEUL_DESINSCRIT").length,
    };
  }, [contacts]);

  // Déterminer la catégorie active selon l'onglet sélectionné
  const currentCategorie = mainTab === "clients" ? clientSubTab : filleulSubTab;
  const isFilleulTab = mainTab === "filleuls";

  const filteredContacts = contacts
    .filter((contact) => {
      // Filtre de recherche textuelle
      const matchesSearch = contactMatchesSearch(searchQuery, contact);

      // 🔥 Filtre par catégorie - LOGIQUE INDÉPENDANTE
      let matchesCategorie = false;
      if (isFilleulTab) {
        // Onglet FILLEULS → filtrer par filleul_categorie
        matchesCategorie = contact.filleul_categorie === currentCategorie;
      } else {
        // Onglet CLIENTS → filtrer par categorie
        matchesCategorie = contact.categorie === currentCategorie;
      }

      // Filtre par statut
      const matchesStatut =
        statutFilter === "ALL" || contact.statut_suivi === statutFilter;

      // Filtre par étiquette
      const matchesEtiquette = etiquetteFilter === "ALL" || (
        contact.id && 
        etiquettesParContact[contact.id]?.some(e => e.etiquette_id.toString() === etiquetteFilter)
      );

      const matchesFollowup =
        !needsFollowupOnly ||
        (contact.id != null && alertContactIds.has(contact.id));

      return (
        matchesSearch &&
        matchesCategorie &&
        matchesStatut &&
        matchesEtiquette &&
        matchesFollowup
      );
    })
    .sort((a, b) => {
      // Tri par priorité : rouge (1) > orange (2) > vert (3)
      // 🔥 Utiliser la bonne fonction selon l'onglet
      const prioriteA = isFilleulTab ? getPrioriteFilleul(a).priorite : getPrioriteContact(a).priorite;
      const prioriteB = isFilleulTab ? getPrioriteFilleul(b).priorite : getPrioriteContact(b).priorite;
      return prioriteA - prioriteB;
    });

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

    // Calculer le patrimoine de chaque groupe (on va le faire en asynchrone après)
    return Object.values(grouped).sort((a, b) => {
      // Les foyers en premier, puis les contacts sans foyer
      if (a.foyer && !b.foyer) return -1;
      if (!a.foyer && b.foyer) return 1;
      // Tri par nom de foyer
      if (a.foyer && b.foyer) {
        return a.foyer.nom.localeCompare(b.foyer.nom);
      }
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

  const useFoyerVirtual = groupByFoyer && foyerFlatRows.length > 40;

  useEffect(() => {
    const calculatePatrimoines = async () => {
      const newPatrimoines: Record<string, number> = {};
      const newPatrimoinesAvecMoi: Record<string, number> = {};

      for (const contact of contacts) {
        try {
          const investissements = await getInvestissementsByContact(contact.id!);
          const total = investissements.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
          const avecMoi = investissements
            .filter(inv => inv.origine === "MON_CONSEIL")
            .reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
          newPatrimoines[`contact_${contact.id}`] = total / 100;
          newPatrimoinesAvecMoi[`contact_${contact.id}`] = avecMoi / 100;
        } catch (error) {
          newPatrimoines[`contact_${contact.id}`] = 0;
          newPatrimoinesAvecMoi[`contact_${contact.id}`] = 0;
        }
      }

      for (const foyer of foyers) {
        try {
          const membres = getContactsForFoyer(contacts, foyer.id);
          const total = await loadFoyerPatrimoineCentimes(foyer.id, membres);
          const avecMoi = await loadFoyerPatrimoineCentimes(foyer.id, membres, {
            avecMoiOnly: true,
          });
          newPatrimoines[`foyer_${foyer.id}`] = total / 100;
          newPatrimoinesAvecMoi[`foyer_${foyer.id}`] = avecMoi / 100;
        } catch (error) {
          newPatrimoines[`foyer_${foyer.id}`] = 0;
          newPatrimoinesAvecMoi[`foyer_${foyer.id}`] = 0;
        }
      }

      setPatrimoines(newPatrimoines);
      setPatrimoinesAvecMoi(newPatrimoinesAvecMoi);
    };

    if (contacts.length > 0) {
      calculatePatrimoines();
    }
  }, [contacts, foyers]);

  const reloadEtiquettesAttributions = useCallback(async () => {
    try {
      const [all, rows] = await Promise.all([
        getAllEtiquettes(),
        contacts.length > 0
          ? getAllContactEtiquettesDetails()
          : Promise.resolve([]),
      ]);
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

  const isWideLayout = useMediaQuery("(min-width: 1024px)");
  /** Grand écran : liste pleine largeur, split 50/50 seulement après sélection d’un contact */
  const showSplit = isWideLayout && selectedContact != null;

  const openContactDetail = (contact: Contact) => {
    setSelectedContact(contact);
    if (!isWideLayout) {
      setShowDetail(true);
    }
  };

  const closeContactDetail = () => {
    setSelectedContact(null);
    setShowDetail(false);
  };

  const handleDeleteContact = async (id: number) => {
    try {
      await deleteContact(id);
      await loadContacts();
    } catch (error) {
      console.error("Error deleting contact:", error);
      alert("Erreur lors de la suppression: " + String(error));
    }
  };

  const handleDeleteAllContacts = async () => {
    // Déterminer quel type de contacts supprimer selon l'onglet actif
    const isClients = mainTab === "clients";
    const contactsToDelete = filteredContacts;
    const typeLabel = isClients ? "clients" : "filleuls";
    
    if (contactsToDelete.length === 0) {
      alert(`Aucun ${typeLabel} à supprimer`);
      return;
    }

    const confirmed = window.confirm(
      `⚠️ ATTENTION - Action irréversible !\n\nVoulez-vous vraiment supprimer TOUS les ${contactsToDelete.length} ${typeLabel} ?\n\nCette action ne peut pas être annulée.`
    );
    
    if (!confirmed) return;

    try {
      let deleted = 0;
      let cleared = 0;

      if (isClients) {
        // 🔥 Suppression des CLIENTS : logique spéciale pour protéger les filleuls
        for (const contact of contactsToDelete) {
          if (contact.filleul_categorie) {
            // Ce contact est aussi un filleul → juste effacer categorie (mettre AUCUN)
            // 🔥 Ne pas spreader ...contact pour éviter les FK invalides
            await updateContact(contact.id!, {
              nom: contact.nom,
              prenom: contact.prenom,
              email: contact.email || undefined,
              telephone: contact.telephone || undefined,
              adresse: contact.adresse || undefined,
              code_postal: contact.code_postal || undefined,
              ville: contact.ville || undefined,
              profession: contact.profession || undefined,
              categorie: "AUCUN", // Effacer le statut client
              statut_suivi: contact.statut_suivi || "ACTIF", // 🔥 Champ NOT NULL requis
              filleul_categorie: contact.filleul_categorie,
              parrain_id: contact.parrain_id || undefined,
              prescripteur_id: contact.prescripteur_id || undefined,
              date_naissance: contact.date_naissance 
                ? new Date(contact.date_naissance * 1000).toISOString() 
                : undefined,
              date_dernier_contact: undefined, // Effacer les dates CLIENT
              date_prochain_suivi: undefined,
              date_dernier_contact_filleul: contact.date_dernier_contact_filleul 
                ? new Date(contact.date_dernier_contact_filleul * 1000).toISOString() 
                : undefined,
              date_prochain_suivi_filleul: contact.date_prochain_suivi_filleul 
                ? new Date(contact.date_prochain_suivi_filleul * 1000).toISOString() 
                : undefined,
            });
            cleared++;
          } else {
            // Ce contact n'est PAS un filleul → supprimer le contact
            await deleteContact(contact.id!);
            deleted++;
          }
        }
        const message = cleared > 0 
          ? `✅ ${deleted} ${typeLabel} supprimé(s), ${cleared} conservé(s) (aussi filleuls)`
          : `✅ ${deleted} ${typeLabel} supprimé(s) avec succès`;
        alert(message);
      } else {
        // 🔥 Suppression des FILLEULS : logique spéciale pour protéger les clients
        for (const contact of contactsToDelete) {
          if (contact.categorie === "CLIENT" || 
              contact.categorie === "PROSPECT_CLIENT" || 
              contact.categorie === "SUSPECT_CLIENT") {
            // Ce contact est aussi un client → juste effacer filleul_categorie + dates filleul
            // 🔥 Ne pas spreader ...contact pour éviter les FK invalides
            await updateContact(contact.id!, {
              nom: contact.nom,
              prenom: contact.prenom,
              email: contact.email || undefined,
              telephone: contact.telephone || undefined,
              adresse: contact.adresse || undefined,
              code_postal: contact.code_postal || undefined,
              ville: contact.ville || undefined,
              profession: contact.profession || undefined,
              categorie: contact.categorie,
              statut_suivi: contact.statut_suivi || "ACTIF", // 🔥 Champ NOT NULL requis
              filleul_categorie: undefined, // Effacer le statut filleul
              parrain_id: undefined, // Effacer le lien parrain
              prescripteur_id: contact.prescripteur_id || undefined,
              date_naissance: contact.date_naissance 
                ? new Date(contact.date_naissance * 1000).toISOString() 
                : undefined,
              date_dernier_contact: contact.date_dernier_contact 
                ? new Date(contact.date_dernier_contact * 1000).toISOString() 
                : undefined,
              date_prochain_suivi: contact.date_prochain_suivi 
                ? new Date(contact.date_prochain_suivi * 1000).toISOString() 
                : undefined,
              date_dernier_contact_filleul: undefined,
              date_prochain_suivi_filleul: undefined,
            });
            cleared++;
          } else {
            // Ce contact n'est PAS un client → supprimer le contact
            await deleteContact(contact.id!);
            deleted++;
          }
        }
        
        if (cleared > 0 && deleted > 0) {
          alert(`✅ ${deleted} filleul(s) supprimé(s), ${cleared} client(s) conservé(s) (statut filleul effacé)`);
        } else if (cleared > 0) {
          alert(`✅ ${cleared} client(s) conservé(s) (statut filleul effacé)`);
        } else {
          alert(`✅ ${deleted} filleul(s) supprimé(s)`);
        }
      }
      
      await loadContacts();
    } catch (error) {
      console.error("Error deleting contacts:", error);
      alert("❌ Erreur lors de la suppression: " + String(error));
    }
  };

  const currentSubTab =
    mainTab === "clients" ? clientSubTab : filleulSubTab;
  const selectedEtiquette = etiquettesDisponibles.find(
    (e) => e.id.toString() === etiquetteFilter
  );
  const hasExtraFilters =
    statutFilter !== "ALL" ||
    etiquetteFilter !== "ALL" ||
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
        "space-y-6 mx-auto pb-8",
        showSplit ? "max-w-[1800px]" : "max-w-[1600px]"
      )}
    >
      <ContactsPageHeader
        mainTab={mainTab}
        filteredCount={filteredContacts.length}
        onNewContact={() => setShowForm(true)}
        onImport={() =>
          mainTab === "filleuls" ? setShowImportFilleuls(true) : setShowImport(true)
        }
        onDeduplicate={() => setShowDeduplicate(true)}
        onDeleteAll={() => void handleDeleteAllContacts()}
      />

      <div className={cn("grid gap-4 items-start", showSplit && "lg:grid-cols-2")}>
      <Card className={cn("border-border/70 shadow-sm min-w-0", showSplit && "min-h-0")}>
        <CardHeader>
          <div className="space-y-4">
            <div>
              <CardTitle className="font-serif">Liste des contacts</CardTitle>
              <CardDescription>
                {filteredContacts.length} résultat
                {filteredContacts.length > 1 ? "s" : ""}
                {groupByFoyer ? " · regroupés par foyer" : ""}
              </CardDescription>
            </div>

            <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as MainTab)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-auto">
                <TabsTrigger value="clients" className="gap-2 py-2.5">
                  Clients
                  <Badge variant="secondary" className="ml-1 tabular-nums">
                    {categoryCounts.CLIENT +
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
                <Tabs value={clientSubTab} onValueChange={(value) => setClientSubTab(value as ClientSubTab)}>
                  <TabsList className="grid w-full grid-cols-3">
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
                  </TabsList>
                </Tabs>
              </TabsContent>

              {/* Contenu onglet FILLEULS */}
              <TabsContent value="filleuls" className="space-y-4 mt-4">
                <Tabs value={filleulSubTab} onValueChange={(value) => setFilleulSubTab(value as FilleulSubTab)}>
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
                    <SelectItem value="EN_PAUSE">En pause</SelectItem>
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
                needsFollowupOnly={needsFollowupOnly}
                onToggleNeedsFollowup={() => setNeedsFollowupOnly((v) => !v)}
                followupCount={alertContactIds.size}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
              <div className="border border-border/70 rounded-xl overflow-hidden divide-y divide-border">
                <VirtualizedFoyerContactList
                  rows={foyerFlatRows}
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
              <div className="space-y-4">
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
          ) : filteredContacts.length > 50 ? (
            <VirtualizedContactList
              items={filteredContacts}
              getKey={(contact) => contact.id ?? `${contact.nom}-${contact.prenom}`}
              renderItem={(contact) => (
                <ContactListRow
                  contact={contact}
                  {...listRowProps}
                  selected={selectedContact?.id === contact.id}
                  variant="card"
                />
              )}
              className="pr-1"
            />
          ) : (
            <div className="space-y-2">
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
        </CardContent>
      </Card>

      {showSplit && selectedContact && (
        <div className="hidden lg:block min-w-0 lg:sticky lg:top-4 self-start">
          <ContactDetail
            key={selectedContact.id}
            embedded
            open
            contact={selectedContact}
            onOpenChange={(open) => {
              if (!open) closeContactDetail();
            }}
            onDelete={handleDeleteContact}
            onUpdate={loadContacts}
            onContactRefreshed={setSelectedContact}
            onNavigate={onNavigate}
            onOpenContact={openContactDetail}
          />
        </div>
      )}
      </div>

      {/* Formulaire de création */}
      <ContactForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={loadContacts}
        createContext={mainTab === "filleuls" ? "filleuls" : "clients"}
        onOpenContact={openContactDetail}
      />

      {/* Import de contacts clients */}
      <ErrorBoundary>
        <ContactImport
          open={showImport}
          onOpenChange={setShowImport}
          onSuccess={loadContacts}
        />
      </ErrorBoundary>

      {/* Import de filleuls */}
      <ErrorBoundary>
        <ContactImportFilleuls
          open={showImportFilleuls}
          onOpenChange={setShowImportFilleuls}
          onSuccess={loadContacts}
        />
      </ErrorBoundary>

      {/* Déduplication */}
      <ContactDeduplicate
        open={showDeduplicate}
        onOpenChange={setShowDeduplicate}
        onSuccess={loadContacts}
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
          onUpdate={loadContacts}
          onContactRefreshed={setSelectedContact}
          onNavigate={onNavigate}
          onOpenContact={openContactDetail}
        />
      )}
    </div>
  );
}
