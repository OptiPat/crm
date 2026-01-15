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
import { Plus, Search, Mail, Phone, Filter } from "lucide-react";
import { getAllContacts, deleteContact, type Contact } from "@/lib/api/tauri-contacts";
import { ContactForm } from "@/components/contacts/ContactForm";
import { ContactDetail } from "@/components/contacts/ContactDetail";

export function Contacts() {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [categorieFilter, setCategorieFilter] = useState<string>("ALL");
  const [statutFilter, setStatutFilter] = useState<string>("ALL");
  const [showForm, setShowForm] = useState(false);
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
  const [showDetail, setShowDetail] = useState(false);

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

  const filteredContacts = contacts.filter((contact) => {
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
  });

  const getCategorieColor = (categorie: string) => {
    switch (categorie) {
      case "CLIENT":
        return "bg-green-100 text-green-800";
      case "PROSPECT":
        return "bg-blue-100 text-blue-800";
      case "ANCIEN_CLIENT":
        return "bg-gray-100 text-gray-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const getStatutColor = (statut: string) => {
    switch (statut) {
      case "ACTIF":
        return "bg-green-100 text-green-800";
      case "INACTIF":
        return "bg-red-100 text-red-800";
      case "EN_ATTENTE":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
    }
  };

  const handleViewContact = (contact: Contact) => {
    setSelectedContact(contact);
    setShowDetail(true);
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
        <Button className="gap-2" onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4" />
          Nouveau contact
        </Button>
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
                  <SelectItem value="PROSPECT">Prospects</SelectItem>
                  <SelectItem value="ANCIEN_CLIENT">Anciens clients</SelectItem>
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
                  <SelectItem value="INACTIF">Inactifs</SelectItem>
                  <SelectItem value="EN_ATTENTE">En attente</SelectItem>
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
              {filteredContacts.map((contact) => (
                <div
                  key={contact.id}
                  className="p-4 border border-border rounded-lg hover:bg-accent transition-colors cursor-pointer"
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
                      </div>
                    </div>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => handleViewContact(contact)}
                    >
                      Voir détails
                    </Button>
                  </div>
                </div>
              ))}
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

      {/* Fiche détaillée */}
      <ContactDetail
        open={showDetail}
        onOpenChange={setShowDetail}
        contact={selectedContact}
        onDelete={handleDeleteContact}
        onUpdate={loadContacts}
      />
    </div>
  );
}
