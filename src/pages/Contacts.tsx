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
import { Plus, Search, Mail, Phone, Filter, FileUp, Trash2, Users } from "lucide-react";
import { getAllContacts, deleteContact, type Contact } from "@/lib/api/tauri-contacts";
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

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const data = await getAllContacts();
      console.log("🔍 DEBUG - Premier contact chargé:", data[0]);
      console.log("🔍 DEBUG - date_dernier_contact:", data[0]?.date_dernier_contact, "Type:", typeof data[0]?.date_dernier_contact);
      setContacts(data);
      setIsInitialLoad(false);
    } catch (error) {
      // Si c'est le premier chargement et erreur de type de colonne, réessayer après un court délai
      if (isInitialLoad && error instanceof Error && error.message.includes("Invalid column type")) {
        console.log("⏳ Database initializing, retrying in 500ms...");
        setTimeout(loadContacts, 500);
      } else {
        console.error("Error loading contacts:", error);
        setIsInitialLoad(false);
      }
    } finally {
      if (!isInitialLoad) {
        setLoading(false);
      }
    }
  };

  // Calcul de la priorité de suivi selon le prompt
  const getPrioriteContact = (contact: Contact) => {
    if (!contact.date_dernier_contact) {
      // Pas de date de dernier contact = priorité selon catégorie
      if (contact.categorie === "CLIENT") {
        return { color: "bg-red-50 border-l-4 border-red-500", priorite: 1, label: "⚠️ Client sans historique" };
      }
      if (contact.categorie.includes("SUSPECT")) {
        return { color: "bg-orange-50 border-l-4 border-orange-500", priorite: 2, label: "⚠️ Suspect sans historique" };
      }
      return { color: "", priorite: 3, label: "" };
    }

    const now = new Date();
    const lastContact = new Date(contact.date_dernier_contact * 1000);
    const diffMonths = (now.getTime() - lastContact.getTime()) / (1000 * 60 * 60 * 24 * 30);

    // Rouge : Client sans contact depuis > 12 mois
    if (contact.categorie === "CLIENT" && diffMonths > 12) {
      return { color: "bg-red-50 border-l-4 border-red-500", priorite: 1, label: "🔴 À recontacter d'urgence" };
    }

    // Orange : Suspect sans contact depuis > 6 mois
    if (contact.categorie.includes("SUSPECT") && diffMonths > 6) {
      return { color: "bg-orange-50 border-l-4 border-orange-500", priorite: 2, label: "🟠 Relance recommandée" };
    }

    // Vert : Suivi à jour
    return { color: "bg-green-50 border-l-4 border-green-500", priorite: 3, label: "🟢 Suivi à jour" };
  };

  // Calcul des compteurs par catégorie
  const categoryCounts = useMemo(() => {
    return {
      // Clients
      CLIENT: contacts.filter(c => c.categorie === "CLIENT").length,
      PROSPECT_CLIENT: contacts.filter(c => c.categorie === "PROSPECT_CLIENT").length,
      SUSPECT_CLIENT: contacts.filter(c => c.categorie === "SUSPECT_CLIENT").length,
      // Filleuls
      FILLEUL: contacts.filter(c => c.categorie === "FILLEUL").length,
      PROSPECT_FILLEUL: contacts.filter(c => c.categorie === "PROSPECT_FILLEUL").length,
      SUSPECT_FILLEUL: contacts.filter(c => c.categorie === "SUSPECT_FILLEUL").length,
      FILLEUL_DESINSCRIT: contacts.filter(c => c.categorie === "FILLEUL_DESINSCRIT").length,
    };
  }, [contacts]);

  // Déterminer la catégorie active selon l'onglet sélectionné
  const currentCategorie = mainTab === "clients" ? clientSubTab : filleulSubTab;

  const filteredContacts = contacts
    .filter((contact) => {
      // Filtre de recherche textuelle
      const search = searchQuery.toLowerCase();
      const matchesSearch =
        contact.nom?.toLowerCase().includes(search) ||
        contact.prenom?.toLowerCase().includes(search) ||
        contact.email?.toLowerCase().includes(search) ||
        contact.telephone?.toLowerCase().includes(search);

      // Filtre par catégorie active
      const matchesCategorie = contact.categorie === currentCategorie;

      // Filtre par statut
      const matchesStatut =
        statutFilter === "ALL" || contact.statut_suivi === statutFilter;

      return matchesSearch && matchesCategorie && matchesStatut;
    })
    .sort((a, b) => {
      // Tri par priorité : rouge (1) > orange (2) > vert (3)
      const prioriteA = getPrioriteContact(a).priorite;
      const prioriteB = getPrioriteContact(b).priorite;
      return prioriteA - prioriteB;
    });

  const getCategorieColor = (categorie: string) => {
    switch (categorie) {
      case "CLIENT":
        return "bg-green-100 text-green-800";
      case "PROSPECT_CLIENT":
        return "bg-blue-100 text-blue-800";
      case "SUSPECT_CLIENT":
        return "bg-yellow-100 text-yellow-800";
      case "FILLEUL":
        return "bg-purple-100 text-purple-800";
      case "PROSPECT_FILLEUL":
        return "bg-cyan-100 text-cyan-800";
      case "SUSPECT_FILLEUL":
        return "bg-orange-100 text-orange-800";
      case "FILLEUL_DESINSCRIT":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getCategorieLabel = (categorie: string) => {
    switch (categorie) {
      case "CLIENT": return "Client";
      case "PROSPECT_CLIENT": return "Prospect Client";
      case "SUSPECT_CLIENT": return "Suspect Client";
      case "FILLEUL": return "Filleul";
      case "PROSPECT_FILLEUL": return "Prospect Filleul";
      case "SUSPECT_FILLEUL": return "Suspect Filleul";
      case "FILLEUL_DESINSCRIT": return "Désinscrit";
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
    console.log("Opening contact details for:", contact.id, contact.prenom, contact.nom);
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
      // Supprimer les contacts un par un
      for (const contact of contactsToDelete) {
        await deleteContact(contact.id!);
      }
      alert(`✅ ${contactsToDelete.length} ${typeLabel} supprimé(s) avec succès`);
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
          ) : (
            <div className="space-y-3">
              {filteredContacts.map((contact) => {
                const priorite = getPrioriteContact(contact);
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
                          <Badge className={getCategorieColor(contact.categorie)}>
                            {getCategorieLabel(contact.categorie)}
                          </Badge>
                          <Badge className={getStatutColor(contact.statut_suivi)}>
                            {contact.statut_suivi}
                          </Badge>
                          {priorite.label && (
                            <span className="text-xs font-medium">
                              {priorite.label}
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
                          {contact.date_dernier_contact && (() => {
                            try {
                              const date = new Date(contact.date_dernier_contact * 1000);
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
        />
      )}
    </div>
  );
}
