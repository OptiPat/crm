import { useEffect, useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
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
import { ContactDeduplicate } from "@/components/contacts/ContactDeduplicate";
import { ErrorBoundary } from "@/components/contacts/ErrorBoundary";

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categorieFilter, setCategorieFilter] = useState<string>("ALL");
  const [statutFilter, setStatutFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDetail, setShowDetail] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDeduplicate, setShowDeduplicate] = useState(false);

  useEffect(() => {
    loadContacts();
  }, []);

  const loadContacts = async () => {
    try {
      const data = await getAllContacts();
      setContacts(data);
    } catch (error) {
      console.error("Error loading contacts:", error);
    } finally {
      setLoading(false);
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

  const filteredContacts = contacts
    .filter((contact) => {
      // Filtre de recherche textuelle
      const search = searchQuery.toLowerCase();
      const matchesSearch =
        contact.nom?.toLowerCase().includes(search) ||
        contact.prenom?.toLowerCase().includes(search) ||
        contact.email?.toLowerCase().includes(search) ||
        contact.telephone?.toLowerCase().includes(search);

      // Filtre par catégorie
      const matchesCategorie =
        categorieFilter === "ALL" || contact.categorie === categorieFilter;

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
      case "PROSPECT_FILLEUL":
        return "bg-cyan-100 text-cyan-800";
      case "SUSPECT_CLIENT":
        return "bg-yellow-100 text-yellow-800";
      case "SUSPECT_FILLEUL":
        return "bg-orange-100 text-orange-800";
      default:
        return "bg-gray-100 text-gray-800";
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
    const confirmed = window.confirm(
      `⚠️ ATTENTION !\n\nÊtes-vous sûr de vouloir supprimer TOUS les contacts ?\n\nCette action supprimera définitivement ${contacts.length} contact(s) et ne peut pas être annulée.`
    );
    
    if (!confirmed) return;

    const doubleCheck = window.confirm(
      `🚨 DERNIÈRE CONFIRMATION\n\nVous êtes sur le point de supprimer ${contacts.length} contact(s).\n\nCette action est IRRÉVERSIBLE.\n\nConfirmez-vous ?`
    );

    if (!doubleCheck) return;

    try {
      // Supprimer les contacts un par un (deleteAllContacts n'est pas encore implémenté)
      for (const contact of contacts) {
        await deleteContact(contact.id!);
      }
      alert(`✅ ${contacts.length} contact(s) supprimé(s) avec succès`);
      await loadContacts();
    } catch (error) {
      console.error("Error deleting all contacts:", error);
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
            Gérez vos clients et prospects
          </p>
        </div>
        <div className="flex gap-2">
          {contacts.length > 0 && (
            <Button variant="outline" className="gap-2" onClick={() => setShowDeduplicate(true)}>
              <Users className="h-4 w-4" />
              Dédupliquer
            </Button>
          )}
          <Button variant="outline" className="gap-2" onClick={() => setShowImport(true)}>
            <FileUp className="h-4 w-4" />
            Importer
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
                  {filteredContacts.length} contact{filteredContacts.length > 1 ? "s" : ""} sur {contacts.length}
                </CardDescription>
              </div>
              {contacts.length > 0 && (
                <Button 
                  variant="destructive" 
                  size="sm"
                  onClick={handleDeleteAllContacts}
                  className="gap-2"
                >
                  <Trash2 className="h-4 w-4" />
                  Supprimer tout
                </Button>
              )}
            </div>

            {/* Barre de recherche et filtres */}
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

              <Select value={categorieFilter} onValueChange={setCategorieFilter}>
                <SelectTrigger className="w-[180px]">
                  <Filter className="h-4 w-4 mr-2" />
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">Toutes catégories</SelectItem>
                  <SelectItem value="CLIENT">Clients</SelectItem>
                  <SelectItem value="PROSPECT_CLIENT">Prospects clients</SelectItem>
                  <SelectItem value="PROSPECT_FILLEUL">Prospects filleuls</SelectItem>
                  <SelectItem value="SUSPECT_CLIENT">Suspects clients</SelectItem>
                  <SelectItem value="SUSPECT_FILLEUL">Suspects filleuls</SelectItem>
                </SelectContent>
              </Select>

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
                            {contact.categorie}
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
                          {contact.date_dernier_contact && (
                            <div className="flex items-center gap-1 text-xs">
                              <span>
                                Dernier contact : {new Date(contact.date_dernier_contact * 1000).toLocaleDateString('fr-FR')}
                              </span>
                            </div>
                          )}
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

      {/* Import de contacts */}
      <ErrorBoundary>
        <ContactImport
          open={showImport}
          onOpenChange={setShowImport}
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
