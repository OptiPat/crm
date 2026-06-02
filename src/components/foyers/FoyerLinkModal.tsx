import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, Home, UserPlus } from "lucide-react";
import { type Contact, getAllContacts } from "@/lib/api/tauri-contacts";
import { getAllFoyers, createFoyer, type Foyer } from "@/lib/api/tauri-foyers";
import { linkContactToFoyer, buildFoyerNomFromMembers } from "@/lib/foyers/foyer-utils";
import { Badge } from "@/components/ui/badge";
import { contactMatchesSearch } from "@/lib/search-utils";

interface FoyerLinkModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentContact: Contact;
  onSuccess: () => void;
}

export function FoyerLinkModal({
  open,
  onOpenChange,
  currentContact,
  onSuccess,
}: FoyerLinkModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [foyers, setFoyers] = useState<Foyer[]>([]);
  const [, setSelectedContact] = useState<Contact | null>(null);
  const [selectedRole, setSelectedRole] = useState<string>("DECLARANT_2");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      loadData();
      setSelectedContact(null);
      setSearchQuery("");
      setSelectedRole("DECLARANT_2");
    }
  }, [open]);

  const loadData = async () => {
    try {
      const [allContacts, allFoyers] = await Promise.all([
        getAllContacts(),
        getAllFoyers(),
      ]);
      // Exclure le contact actuel
      setContacts(allContacts.filter(c => c.id !== currentContact.id));
      setFoyers(allFoyers);
    } catch (error) {
      console.error("Error loading data:", error);
    }
  };

  const filteredContacts = contacts.filter((c) =>
    contactMatchesSearch(searchQuery, c)
  );

  const handleJoinFoyer = async (contact: Contact) => {
    if (!contact.foyer_id) return;

    setLoading(true);
    try {
      await linkContactToFoyer(
        currentContact,
        contact.foyer_id,
        selectedRole
      );

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erreur rattachement foyer:", error);
      alert("Erreur lors du rattachement au foyer: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const buildFoyerName = (a: Contact, b: Contact) =>
    buildFoyerNomFromMembers([a, b]);

  const handleCreateFoyerTogether = async (contact: Contact) => {
    setLoading(true);
    try {
      const newFoyer = await createFoyer({
        nom: buildFoyerName(currentContact, contact),
        type_foyer: "COUPLE",
        notes: `Créé depuis ${currentContact.prenom} ${currentContact.nom} et ${contact.prenom} ${contact.nom}`,
      });

      await Promise.all([
        linkContactToFoyer(currentContact, newFoyer.id, "DECLARANT_1"),
        linkContactToFoyer(contact, newFoyer.id, selectedRole),
      ]);

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erreur création foyer:", error);
      alert("Erreur lors de la création du foyer: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const getFoyerName = (foyerId: number) => {
    const foyer = foyers.find(f => f.id === foyerId);
    return foyer?.nom || "Foyer inconnu";
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <UserPlus className="h-5 w-5" />
            Regrouper avec un autre contact
          </DialogTitle>
          <DialogDescription>
            Couple, conjoint ou co-titulaire — les noms de famille peuvent être différents.
            Rejoignez le foyer d’un contact existant ou créez un foyer commun à deux.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recherche */}
          <div className="space-y-2">
            <Label htmlFor="search">Rechercher le conjoint ou co-titulaire</Label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                id="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Nom, prénom, email..."
                className="pl-9"
              />
            </div>
          </div>

          {/* Rôle du contact actuel */}
          <div className="space-y-2">
            <Label>Rôle de {currentContact.prenom} dans le foyer</Label>
            <Select value={selectedRole} onValueChange={setSelectedRole}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DECLARANT_1">Déclarant 1</SelectItem>
                <SelectItem value="DECLARANT_2">Déclarant 2</SelectItem>
                <SelectItem value="ENFANT">Enfant</SelectItem>
                <SelectItem value="AUTRE">Autre membre</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Résultats */}
          <div className="space-y-2">
            <Label>Résultats ({filteredContacts.length})</Label>
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {filteredContacts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {searchQuery ? "Aucun contact trouvé" : "Saisissez un nom pour rechercher"}
                </div>
              ) : (
                filteredContacts.map((contact) => (
                  <div
                    key={contact.id}
                    className="p-4 border rounded-lg space-y-3 hover:bg-accent/50 transition-colors"
                  >
                    <div className="flex items-start justify-between">
                      <div>
                        <h4 className="font-semibold">
                          {contact.prenom} {contact.nom}
                        </h4>
                        {contact.email && (
                          <p className="text-sm text-muted-foreground">{contact.email}</p>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          {contact.foyer_id ? (
                            <>
                              <Home className="h-4 w-4 text-primary" />
                              <span className="text-sm font-medium text-primary">
                                {getFoyerName(contact.foyer_id)}
                              </span>
                            </>
                          ) : (
                            <Badge variant="outline" className="text-xs">
                              Aucun foyer
                            </Badge>
                          )}
                        </div>
                      </div>
                      <Badge className="bg-blue-50 text-blue-700">
                        {contact.categorie}
                      </Badge>
                    </div>

                    {contact.foyer_id ? (
                      <Button
                        className="w-full gap-2"
                        onClick={() => handleJoinFoyer(contact)}
                        disabled={loading}
                      >
                        <Home className="h-4 w-4" />
                        Rejoindre le foyer de {contact.prenom} {contact.nom}
                      </Button>
                    ) : (
                      <Button
                        className="w-full gap-2"
                        variant="outline"
                        onClick={() => handleCreateFoyerTogether(contact)}
                        disabled={loading}
                      >
                        <UserPlus className="h-4 w-4" />
                        Créer un foyer commun ({currentContact.prenom} + {contact.prenom})
                      </Button>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
