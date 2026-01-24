import { useEffect, useState, useMemo } from "react";
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
import { Plus, Search, Mail, Phone, Filter, FileUp, Trash2, Users2 } from "lucide-react";
import { getAllContacts, deleteContact, updateContact, type Contact } from "@/lib/api/tauri-contacts";
import { getAllFoyers, type Foyer } from "@/lib/api/tauri-foyers";
import { getInvestissementsByContact, getInvestissementsByFoyer } from "@/lib/api/tauri-investissements";
import { ContactForm } from "@/components/contacts/ContactForm";
import { ContactDetail } from "@/components/contacts/ContactDetail";
import { ContactImport } from "@/components/contacts/ContactImport";
import { ContactImportFilleuls } from "@/components/contacts/ContactImportFilleuls";
import { ContactDeduplicate } from "@/components/contacts/ContactDeduplicate";
import { ErrorBoundary } from "@/components/contacts/ErrorBoundary";

type MainTab = "clients" | "filleuls";
type ClientSubTab = "CLIENT" | "PROSPECT_CLIENT" | "SUSPECT_CLIENT";
type FilleulSubTab = "FILLEUL" | "PROSPECT_FILLEUL" | "SUSPECT_FILLEUL" | "FILLEUL_DESINSCRIT";

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("clients");
  const [clientSubTab, setClientSubTab] = useState<ClientSubTab>("CLIENT");
  const [filleulSubTab, setFilleulSubTab] = useState<FilleulSubTab>("FILLEUL");
  const [statutFilter, setStatutFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showImportFilleuls, setShowImportFilleuls] = useState(false);
  const [showDeduplicate, setShowDeduplicate] = useState(false);
  const [groupByFoyer, setGroupByFoyer] = useState(false);

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const [dataContacts, dataFoyers] = await Promise.all([
        getAllContacts(),
        getAllFoyers(),
      ]);
      setContacts(dataContacts);
      setFoyers(dataFoyers);
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

  // Calcul de la priorité de suivi selon le prompt
  // 🔥 Priorité pour les CLIENTS (basée sur date_dernier_contact)
  const getPrioriteContact = (contact: Contact) => {
    if (!contact.date_dernier_contact) {
      // Pas de date de dernier contact
      if (contact.categorie === "CLIENT") {
        return { color: "bg-red-50 border-l-4 border-red-500", priorite: 1, label: "🔴 Jamais suivi" };
      }
      if (contact.categorie.includes("SUSPECT") || contact.categorie.includes("PROSPECT")) {
        return { color: "bg-orange-50 border-l-4 border-orange-500", priorite: 2, label: "🟠 Jamais contacté" };
      }
      return { color: "", priorite: 3, label: "" };
    }

    const now = new Date();
    const lastContact = new Date(contact.date_dernier_contact * 1000);
    const diffMonths = (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24 * 30);

    // 🔴 Suivi +1 an : Client sans contact depuis > 12 mois
    if (contact.categorie === "CLIENT" && diffMonths > 12) {
      return { color: "bg-red-50 border-l-4 border-red-500", priorite: 1, label: "🔴 Suivi +1 an" };
    }

    // 🟠 Suivi +6 mois : Prospect/Suspect sans contact depuis > 6 mois
    if ((contact.categorie.includes("SUSPECT") || contact.categorie.includes("PROSPECT")) && diffMonths > 6) {
      return { color: "bg-orange-50 border-l-4 border-orange-500", priorite: 2, label: "🟠 Suivi +6 mois" };
    }

    // ✅ Suivi récent
    return { color: "bg-green-50 border-l-4 border-green-500", priorite: 3, label: "✅ Suivi récent" };
  };
  
  // 🔥 Priorité pour les FILLEULS (basée sur date_dernier_contact_filleul - INDÉPENDANT)
  const getPrioriteFilleul = (contact: Contact) => {
    if (!contact.date_dernier_contact_filleul) {
      // Pas de date de dernier contact filleul
      return { color: "bg-orange-50 border-l-4 border-orange-500", priorite: 2, label: "🟠 Jamais contacté" };
    }

    const now = new Date();
    const lastContact = new Date(contact.date_dernier_contact_filleul * 1000);
    const diffMonths = (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24 * 30);

    // 🔴 Suivi +6 mois : Filleul sans contact depuis > 6 mois
    if (diffMonths > 6) {
      return { color: "bg-red-50 border-l-4 border-red-500", priorite: 1, label: "🔴 Suivi +6 mois" };
    }

    // 🟠 Suivi +3 mois : Filleul sans contact depuis > 3 mois
    if (diffMonths > 3) {
      return { color: "bg-orange-50 border-l-4 border-orange-500", priorite: 2, label: "🟠 À recontacter" };
    }

    // ✅ Suivi récent
    return { color: "bg-green-50 border-l-4 border-green-500", priorite: 3, label: "✅ Suivi récent" };
  };

  // 🔥 Calcul des compteurs par catégorie
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
      const search = searchQuery.toLowerCase();
      const matchesSearch =
        contact.nom?.toLowerCase().includes(search) ||
        contact.prenom?.toLowerCase().includes(search) ||
        contact.email?.toLowerCase().includes(search) ||
        contact.telephone?.toLowerCase().includes(search);

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

      return matchesSearch && matchesCategorie && matchesStatut;
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
        const foyer = contact.foyer_id ? foyers.find((f) => f.id === contact.foyer_id) || null : null;
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

  // Calculer le patrimoine de chaque contact/foyer
  const [patrimoines, setPatrimoines] = useState<Record<string, number>>({});

  useEffect(() => {
    const calculatePatrimoines = async () => {
      const newPatrimoines: Record<string, number> = {};

      for (const contact of contacts) {
        try {
          const investissements = await getInvestissementsByContact(contact.id!);
          const total = investissements.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
          newPatrimoines[`contact_${contact.id}`] = total / 100; // Convertir centimes en euros
        } catch (error) {
          newPatrimoines[`contact_${contact.id}`] = 0;
        }
      }

      for (const foyer of foyers) {
        try {
          const investissements = await getInvestissementsByFoyer(foyer.id);
          const total = investissements.reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
          newPatrimoines[`foyer_${foyer.id}`] = total / 100; // Convertir centimes en euros
        } catch (error) {
          newPatrimoines[`foyer_${foyer.id}`] = 0;
        }
      }

      setPatrimoines(newPatrimoines);
    };

    if (contacts.length > 0) {
      calculatePatrimoines();
    }
  }, [contacts, foyers]);

  const getCategorieColor = (categorie: string) => {
    switch (categorie) {
      case "CLIENT":
        return "bg-green-100 text-green-800";
      case "PROSPECT_CLIENT":
        return "bg-blue-100 text-blue-800";
      case "SUSPECT_CLIENT":
        return "bg-yellow-100 text-yellow-800";
      case "FILLEUL":
      case "PROSPECT_FILLEUL":
      case "SUSPECT_FILLEUL":
        return "bg-emerald-100 text-emerald-800"; // Filleul inscrit = vert
      case "FILLEUL_DESINSCRIT":
        return "bg-red-100 text-red-800"; // Filleul désinscrit = rouge
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCategorieLabel = (categorie: string) => {
    switch (categorie) {
      case "CLIENT": return "Client";
      case "PROSPECT_CLIENT": return "Prospect";
      case "SUSPECT_CLIENT": return "Suspect";
      case "FILLEUL": return "Filleul inscrit";
      case "PROSPECT_FILLEUL": return "Filleul inscrit";
      case "SUSPECT_FILLEUL": return "Filleul inscrit";
      case "FILLEUL_DESINSCRIT": return "Filleul désinscrit";
      case "AUCUN": return null; // 🔥 Pas de label pour "AUCUN"
      default: return categorie;
    }
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case "ACTIF":
        return "bg-green-100 text-green-800";
      case "EN_PAUSE":
        return "bg-yellow-100 text-yellow-800";
      case "ARCHIVE":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleViewContact = (contact: Contact) => {
    // Fermer d'abord puis rouvrir pour forcer le rafraîchissement
    setShowDetail(false);
    setSelectedContact(contact);
    // Utiliser setTimeout pour s'assurer que le state est bien mis à jour
    setTimeout(() => {
      setShowDetail(true);
    }, 10);
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
            await updateContact(contact.id!, {
              ...contact,
              categorie: "AUCUN", // Effacer le statut client
              // Convertir les dates timestamp en ISO - FILLEUL (garder)
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
            await updateContact(contact.id!, {
              ...contact,
              filleul_categorie: null, // Effacer le statut filleul
              parrain_id: undefined, // Effacer le lien parrain
              // Convertir les dates timestamp en ISO - CLIENT (garder)
              date_naissance: contact.date_naissance 
                ? new Date(contact.date_naissance * 1000).toISOString() 
                : undefined,
              date_dernier_contact: contact.date_dernier_contact 
                ? new Date(contact.date_dernier_contact * 1000).toISOString() 
                : undefined,
              date_prochain_suivi: contact.date_prochain_suivi 
                ? new Date(contact.date_prochain_suivi * 1000).toISOString() 
                : undefined,
              // 🔥 Effacer les dates FILLEUL
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-serif font-bold text-primary mb-2">
            Contacts
          </h2>
          <p className="text-muted-foreground">
            Gérez vos clients et filleuls
          </p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline" 
            className="gap-2" 
            onClick={() => {
              // Ouvrir l'import contextuel selon l'onglet actif
              if (mainTab === "filleuls") {
                setShowImportFilleuls(true);
              } else {
                setShowImport(true);
              }
            }}
          >
            <FileUp className="h-4 w-4" />
            Importer {mainTab === "filleuls" ? "filleuls" : "clients"}
          </Button>
          <Button className="gap-2" onClick={() => setShowForm(true)}>
            <Plus className="h-4 w-4" />
            Nouveau contact
          </Button>
        </div>
      </div>

      <Card>
        <CardHeader>
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Liste des contacts</CardTitle>
                <CardDescription>
                  {filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""}
                </CardDescription>
              </div>
              {filteredContacts.length > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleDeleteAllContacts}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer tous les {mainTab === "clients" ? "clients" : "filleuls"}
                </Button>
              )}
            </div>

            {/* Onglets principaux : CLIENTS / FILLEULS */}
            <Tabs value={mainTab} onValueChange={(value) => setMainTab(value as MainTab)} className="w-full">
              <TabsList className="grid w-full grid-cols-2 h-auto">
                <TabsTrigger value="clients" className="gap-2 py-3 text-base">
                  🏦 CLIENTS
                  <Badge variant="secondary" className="ml-2">
                    {categoryCounts.CLIENT + categoryCounts.PROSPECT_CLIENT + categoryCounts.SUSPECT_CLIENT}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="filleuls" className="gap-2 py-3 text-base">
                  👥 FILLEULS
                  <Badge variant="secondary" className="ml-2">
                    {categoryCounts.FILLEUL + categoryCounts.PROSPECT_FILLEUL + categoryCounts.SUSPECT_FILLEUL + categoryCounts.FILLEUL_DESINSCRIT}
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

            {/* Barre de recherche et filtre statut */}
            <div className="flex gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Rechercher par nom, email, téléphone..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-9"
                />
              </div>

              <Select value={statutFilter} onValueChange={setStatutFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Tous statuts</SelectItem>
                  <SelectItem value="ACTIF">Actifs</SelectItem>
                  <SelectItem value="EN_PAUSE">En pause</SelectItem>
                  <SelectItem value="ARCHIVE">Archivés</SelectItem>
                </SelectContent>
              </Select>

              <Button
                variant={groupByFoyer ? "default" : "outline"}
                onClick={() => setGroupByFoyer(!groupByFoyer)}
                className="gap-2 whitespace-nowrap"
              >
                <Users2 className="h-4 w-4" />
                {groupByFoyer ? "Vue normale" : "Afficher par foyer"}
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="text-center py-8 text-muted-foreground">
              Chargement...
            </div>
          ) : filteredContacts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {searchQuery
                ? "Aucun contact trouvé"
                : "Aucun contact. Commencez par en créer un !"}
            </div>
          ) : groupByFoyer && contactsGroupedByFoyer ? (
            <div className="space-y-6">
              {contactsGroupedByFoyer.map((group, groupIndex) => {
                const foyerPatrimoine = group.foyer 
                  ? patrimoines[`foyer_${group.foyer.id}`] || 0
                  : 0;
                const contactsPatrimoine = group.contacts.reduce(
                  (sum, c) => sum + (patrimoines[`contact_${c.id}`] || 0), 
                  0
                );
                const totalPatrimoine = foyerPatrimoine + contactsPatrimoine;

                return (
                  <div key={groupIndex} className="border border-border rounded-lg overflow-hidden">
                    {group.foyer ? (
                      <>
                        {/* En-tête du foyer */}
                        <div className="bg-muted/50 p-4 border-b border-border">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-3">
                              <Users2 className="h-5 w-5 text-primary" />
                              <h3 className="font-semibold text-lg">{group.foyer.nom}</h3>
                              <Badge variant="secondary">
                                {group.contacts.length} membre{group.contacts.length > 1 ? "s" : ""}
                              </Badge>
                            </div>
                            {/* 🔥 Masquer patrimoine dans l'onglet Filleuls */}
                            {!isFilleulTab && totalPatrimoine > 0 && (
                              <div className="text-sm font-medium text-primary">
                                💰 {totalPatrimoine.toLocaleString("fr-FR")} €
                              </div>
                            )}
                          </div>
                        </div>
                        {/* Membres du foyer */}
                        <div className="divide-y divide-border">
                          {group.contacts.map((contact) => {
                            // 🔥 Utiliser la bonne fonction de priorité selon l'onglet
                            const priorite = isFilleulTab ? getPrioriteFilleul(contact) : getPrioriteContact(contact);
                            const contactPatrimoine = patrimoines[`contact_${contact.id}`] || 0;
                            return (
                              <div
                                key={contact.id}
                                className={`p-4 hover:bg-accent transition-colors ${priorite.color}`}
                              >
                                <div className="flex items-start justify-between">
                                  <div className="flex-1">
                                    <div className="flex items-center gap-3 mb-2">
                                      <h4 className="font-semibold">
                                        {contact.prenom} {contact.nom}
                                      </h4>
                                      {contact.role_foyer && (
                                        <Badge variant="outline" className="text-xs">
                                          {contact.role_foyer === "DECLARANT_1" ? "Déclarant 1" :
                                           contact.role_foyer === "DECLARANT_2" ? "Déclarant 2" :
                                           contact.role_foyer === "ENFANT" ? "Enfant" : "Autre"}
                                        </Badge>
                                      )}
                                      {/* 🔥 Badge categorie seulement si pas "AUCUN" ET pas dans l'onglet Filleuls */}
                                      {!isFilleulTab && contact.categorie !== "AUCUN" && (
                                        <Badge className={getCategorieColor(contact.categorie)}>
                                          {getCategorieLabel(contact.categorie)}
                                        </Badge>
                                      )}
                                      {/* 🔥 Badge filleul_categorie si présent ET dans l'onglet Filleuls */}
                                      {isFilleulTab && contact.filleul_categorie && (
                                        <Badge className={
                                          contact.filleul_categorie === "FILLEUL_DESINSCRIT" 
                                            ? "bg-red-100 text-red-800" 
                                            : "bg-emerald-100 text-emerald-800"
                                        }>
                                          {contact.filleul_categorie === "FILLEUL" && "✅ Filleul inscrit"}
                                          {contact.filleul_categorie === "PROSPECT_FILLEUL" && "🟡 Prospect filleul"}
                                          {contact.filleul_categorie === "SUSPECT_FILLEUL" && "🟠 Suspect filleul"}
                                          {contact.filleul_categorie === "FILLEUL_DESINSCRIT" && "❌ Filleul désinscrit"}
                                        </Badge>
                                      )}
                                      {priorite.label && (
                                        <span className="text-xs font-medium">
                                          {priorite.label}
                                        </span>
                                      )}
                                      {/* 🔥 Patrimoine seulement dans l'onglet Clients */}
                                      {!isFilleulTab && contactPatrimoine > 0 && (
                                        <span className="text-xs text-muted-foreground">
                                          {contactPatrimoine.toLocaleString("fr-FR")} €
                                        </span>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                      {contact.email && (
                                        <div className="flex items-center gap-1">
                                          <Mail className="h-4 w-4" />
                                          {contact.email}
                                        </div>
                                      )}
                                      {contact.telephone && (
                                        <div className="flex items-center gap-1">
                                          <Phone className="h-4 w-4" />
                                          {contact.telephone}
                                        </div>
                                      )}
                                      {/* 🔥 Afficher la bonne date selon l'onglet */}
                                      {(() => {
                                        const dateToUse = isFilleulTab 
                                          ? contact.date_dernier_contact_filleul 
                                          : contact.date_dernier_contact;
                                        if (!dateToUse) return null;
                                        try {
                                          const date = new Date(dateToUse * 1000);
                                          if (!isNaN(date.getTime())) {
                                            return (
                                              <div className="flex items-center gap-1 text-xs">
                                                <span>
                                                  Dernier contact : {date.toLocaleDateString('fr-FR')}
                                                </span>
                                              </div>
                                            );
                                          }
                                        } catch (e) {
                                          return null;
                                        }
                                        return null;
                                      })()}
                                    </div>
                                  </div>
                                  <Button 
                                    variant="outline" 
                                    size="sm"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleViewContact(contact);
                                    }}
                                  >
                                    Voir détails
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    ) : (
                      // Contact sans foyer
                      <div className="p-4">
                        {group.contacts.map((contact) => {
                          // 🔥 Utiliser la bonne fonction de priorité selon l'onglet
                          const priorite = isFilleulTab ? getPrioriteFilleul(contact) : getPrioriteContact(contact);
                          const contactPatrimoine = patrimoines[`contact_${contact.id}`] || 0;
                          return (
                            <div
                              key={contact.id}
                              className={`p-4 border border-border rounded-lg hover:bg-accent transition-colors ${priorite.color}`}
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex-1">
                                  <div className="flex items-center gap-3 mb-2">
                                    <h3 className="font-semibold text-lg">
                                      {contact.prenom} {contact.nom}
                                    </h3>
                                    <Badge variant="outline" className="text-xs text-muted-foreground">
                                      Non rattaché
                                    </Badge>
                                    {/* 🔥 Badge categorie seulement si pas "AUCUN" ET pas dans l'onglet Filleuls */}
                                    {!isFilleulTab && contact.categorie !== "AUCUN" && (
                                      <Badge className={getCategorieColor(contact.categorie)}>
                                        {getCategorieLabel(contact.categorie)}
                                      </Badge>
                                    )}
                                    {/* 🔥 Badge filleul_categorie si présent ET dans l'onglet Filleuls */}
                                    {isFilleulTab && contact.filleul_categorie && (
                                      <Badge className={
                                        contact.filleul_categorie === "FILLEUL_DESINSCRIT" 
                                          ? "bg-red-100 text-red-800" 
                                          : "bg-emerald-100 text-emerald-800"
                                      }>
                                        {contact.filleul_categorie === "FILLEUL" && "✅ Filleul inscrit"}
                                        {contact.filleul_categorie === "PROSPECT_FILLEUL" && "🟡 Prospect filleul"}
                                        {contact.filleul_categorie === "SUSPECT_FILLEUL" && "🟠 Suspect filleul"}
                                        {contact.filleul_categorie === "FILLEUL_DESINSCRIT" && "❌ Filleul désinscrit"}
                                      </Badge>
                                    )}
                                    {priorite.label && (
                                      <span className="text-xs font-medium">
                                        {priorite.label}
                                      </span>
                                    )}
                                    {/* 🔥 Patrimoine seulement dans l'onglet Clients */}
                                    {!isFilleulTab && contactPatrimoine > 0 && (
                                      <span className="text-xs text-muted-foreground">
                                        {contactPatrimoine.toLocaleString("fr-FR")} €
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-4 text-sm text-muted-foreground">
                                    {contact.email && (
                                      <div className="flex items-center gap-1">
                                        <Mail className="h-4 w-4" />
                                        {contact.email}
                                      </div>
                                    )}
                                    {contact.telephone && (
                                      <div className="flex items-center gap-1">
                                        <Phone className="h-4 w-4" />
                                        {contact.telephone}
                                      </div>
                                    )}
                                    {/* 🔥 Afficher la bonne date selon l'onglet */}
                                    {(() => {
                                      const dateToUse = isFilleulTab 
                                        ? contact.date_dernier_contact_filleul 
                                        : contact.date_dernier_contact;
                                      if (!dateToUse) return null;
                                      try {
                                        const date = new Date(dateToUse * 1000);
                                        if (!isNaN(date.getTime())) {
                                          return (
                                            <div className="flex items-center gap-1 text-xs">
                                              <span>
                                                Dernier contact : {date.toLocaleDateString('fr-FR')}
                                              </span>
                                            </div>
                                          );
                                        }
                                      } catch (e) {
                                        return null;
                                      }
                                      return null;
                                    })()}
                                  </div>
                                </div>
                                <Button 
                                  variant="outline" 
                                  size="sm"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleViewContact(contact);
                                  }}
                                >
                                  Voir détails
                                </Button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredContacts.map((contact) => {
                // 🔥 Utiliser la bonne fonction de priorité selon l'onglet
                const priorite = isFilleulTab ? getPrioriteFilleul(contact) : getPrioriteContact(contact);
                const contactPatrimoine = patrimoines[`contact_${contact.id}`] || 0;
                return (
                  <div
                    key={contact.id}
                    className={`p-4 border border-border rounded-lg hover:bg-accent transition-colors ${priorite.color}`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="font-semibold text-lg">
                            {contact.prenom} {contact.nom}
                          </h3>
                          {/* 🔥 Badge categorie seulement si pas "AUCUN" ET pas dans l'onglet Filleuls */}
                          {!isFilleulTab && contact.categorie !== "AUCUN" && (
                            <Badge className={getCategorieColor(contact.categorie)}>
                              {getCategorieLabel(contact.categorie)}
                            </Badge>
                          )}
                          {/* 🔥 Badge filleul_categorie si présent ET dans l'onglet Filleuls */}
                          {isFilleulTab && contact.filleul_categorie && (
                            <Badge className={
                              contact.filleul_categorie === "FILLEUL_DESINSCRIT" 
                                ? "bg-red-100 text-red-800" 
                                : "bg-emerald-100 text-emerald-800"
                            }>
                              {contact.filleul_categorie === "FILLEUL" && "✅ Filleul inscrit"}
                              {contact.filleul_categorie === "PROSPECT_FILLEUL" && "🟡 Prospect filleul"}
                              {contact.filleul_categorie === "SUSPECT_FILLEUL" && "🟠 Suspect filleul"}
                              {contact.filleul_categorie === "FILLEUL_DESINSCRIT" && "❌ Filleul désinscrit"}
                            </Badge>
                          )}
                          {priorite.label && (
                            <span className="text-xs font-medium">
                              {priorite.label}
                            </span>
                          )}
                          {/* 🔥 Patrimoine seulement dans l'onglet Clients */}
                          {!isFilleulTab && contactPatrimoine > 0 && (
                            <span className="text-sm font-medium text-primary">
                              💰 {contactPatrimoine.toLocaleString("fr-FR")} €
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          {contact.email && (
                            <div className="flex items-center gap-1">
                              <Mail className="h-4 w-4" />
                              {contact.email}
                            </div>
                          )}
                          {contact.telephone && (
                            <div className="flex items-center gap-1">
                              <Phone className="h-4 w-4" />
                              {contact.telephone}
                            </div>
                          )}
                          {/* 🔥 Afficher la bonne date selon l'onglet */}
                          {(() => {
                            const dateToUse = isFilleulTab 
                              ? contact.date_dernier_contact_filleul 
                              : contact.date_dernier_contact;
                            if (!dateToUse) return null;
                            try {
                              const date = new Date(dateToUse * 1000);
                              if (!isNaN(date.getTime())) {
                                return (
                                  <div className="flex items-center gap-1 text-xs">
                                    <span>
                                      Dernier contact : {date.toLocaleDateString('fr-FR')}
                                    </span>
                                  </div>
                                );
                              }
                            } catch (e) {
                              return null;
                            }
                            return null;
                          })()}
                        </div>
                      </div>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleViewContact(contact);
                        }}
                      >
                        Voir détails
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Formulaire de création */}
      <ContactForm
        open={showForm}
        onOpenChange={setShowForm}
        onSuccess={loadContacts}
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

      {/* Fiche détaillée */}
      {selectedContact && (
        <ContactDetail
          key={selectedContact.id}
          open={showDetail}
          onOpenChange={setShowDetail}
          contact={selectedContact}
          onDelete={handleDeleteContact}
          onUpdate={loadContacts}
          onOpenContact={(contact) => {
            setSelectedContact(contact);
            setShowDetail(true);
          }}
        />
      )}
    </div>
  );
}
