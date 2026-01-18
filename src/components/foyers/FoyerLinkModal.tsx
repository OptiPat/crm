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
import { Search, Home } from "lucide-react";
import { type Contact, getAllContacts, updateContact } from "@/lib/api/tauri-contacts";
import { getAllFoyers, createFoyer, type Foyer } from "@/lib/api/tauri-foyers";
import { Badge } from "@/components/ui/badge";

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
  const [selectedContact, setSelectedContact] = useState<Contact | null>(null);
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

  const filteredContacts = contacts.filter(c => {
    const search = searchQuery.toLowerCase();
    return (
      c.nom.toLowerCase().includes(search) ||
      c.prenom.toLowerCase().includes(search) ||
      c.email?.toLowerCase().includes(search)
    );
  });

  const handleJoinFoyer = async (contact: Contact) => {
    console.log("🔗 [FoyerLinkModal] handleJoinFoyer - Début");
    console.log("🔗 [FoyerLinkModal] Contact sélectionné:", contact.prenom, contact.nom, "foyer_id:", contact.foyer_id);
    console.log("🔗 [FoyerLinkModal] Contact actuel:", currentContact.prenom, currentContact.nom);
    console.log("🔗 [FoyerLinkModal] Rôle sélectionné:", selectedRole);

    if (!contact.foyer_id) return;

    setLoading(true);
    try {
      console.log("🔗 [FoyerLinkModal] Rattachement au foyer ID:", contact.foyer_id);
      // Rejoindre le foyer du contact sélectionné
      await updateContact(currentContact.id!, {
        ...currentContact,
        foyer_id: contact.foyer_id,
        role_foyer: selectedRole,
        date_naissance: currentContact.date_naissance 
          ? new Date(currentContact.date_naissance * 1000).toISOString() 
          : undefined,
        date_dernier_contact: currentContact.date_dernier_contact 
          ? new Date(currentContact.date_dernier_contact * 1000).toISOString() 
          : undefined,
        date_prochain_suivi: currentContact.date_prochain_suivi 
          ? new Date(currentContact.date_prochain_suivi * 1000).toISOString() 
          : undefined,
      });

      console.log("🔗 [FoyerLinkModal] ✓ Contact rattaché avec succès");
      console.log("🔗 [FoyerLinkModal] Appel de onSuccess()");
      onSuccess();
      console.log("🔗 [FoyerLinkModal] Fermeture de la modale");
      onOpenChange(false);
    } catch (error) {
      console.error("🔗 [FoyerLinkModal] ❌ Erreur:", error);
      alert("Erreur lors du rattachement au foyer: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateFoyerTogether = async (contact: Contact) => {
    console.log("🔗 [FoyerLinkModal] handleCreateFoyerTogether - Début");
    console.log("🔗 [FoyerLinkModal] Contact sélectionné:", contact.prenom, contact.nom);
    console.log("🔗 [FoyerLinkModal] Contact actuel:", currentContact.prenom, currentContact.nom);
    console.log("🔗 [FoyerLinkModal] Rôle sélectionné:", selectedRole);

    setLoading(true);
    try {
      // Créer un nouveau foyer avec le nom du contact actuel
      console.log("🔗 [FoyerLinkModal] Création du foyer 'Famille", currentContact.nom, "'");
      const newFoyer = await createFoyer({
        nom: `Famille ${currentContact.nom}`,
        type_foyer: "COUPLE",
        notes: `Créé depuis ${currentContact.prenom} ${currentContact.nom}`,
      });
      console.log("🔗 [FoyerLinkModal] ✓ Foyer créé, ID:", newFoyer.id);

      // Rattacher les deux contacts au nouveau foyer
      console.log("🔗 [FoyerLinkModal] Rattachement des 2 contacts...");
      await Promise.all([
        updateContact(currentContact.id!, {
          ...currentContact,
          foyer_id: newFoyer.id,
          role_foyer: "DECLARANT_1",
          date_naissance: currentContact.date_naissance 
            ? new Date(currentContact.date_naissance * 1000).toISOString() 
            : undefined,
          date_dernier_contact: currentContact.date_dernier_contact 
            ? new Date(currentContact.date_dernier_contact * 1000).toISOString() 
            : undefined,
          date_prochain_suivi: currentContact.date_prochain_suivi 
            ? new Date(currentContact.date_prochain_suivi * 1000).toISOString() 
            : undefined,
        }),
        updateContact(contact.id!, {
          ...contact,
          foyer_id: newFoyer.id,
          role_foyer: selectedRole,
          date_naissance: contact.date_naissance 
            ? new Date(contact.date_naissance * 1000).toISOString() 
            : undefined,
          date_dernier_contact: contact.date_dernier_contact 
            ? new Date(contact.date_dernier_contact * 1000).toISOString() 
            : undefined,
          date_prochain_suivi: contact.date_prochain_suivi 
            ? new Date(contact.date_prochain_suivi * 1000).toISOString() 
            : undefined,
        }),
      ]);
      console.log("🔗 [FoyerLinkModal] ✓ Les 2 contacts ont été rattachés");

      console.log("🔗 [FoyerLinkModal] Appel de onSuccess()");
      onSuccess();
      console.log("🔗 [FoyerLinkModal] Fermeture de la modale");
      onOpenChange(false);
    } catch (error) {
      console.error("🔗 [FoyerLinkModal] ❌ Erreur:", error);
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
          <DialogTitle>
            🔗 Lier {currentContact.prenom} {currentContact.nom} à un contact
          </DialogTitle>
          <DialogDescription>
            Recherchez un contact pour rejoindre son foyer ou créer un foyer ensemble
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Recherche */}
          <div className="space-y-2">
            <Label htmlFor="search">Rechercher un contact</Label>
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
            <Label>Rôle de {currentContact.prenom}</Label>
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
                        className="w-full"
                        onClick={() => handleJoinFoyer(contact)}
                        disabled={loading}
                      >
                        → Rejoindre {getFoyerName(contact.foyer_id)}
                      </Button>
                    ) : (
                      <Button
                        className="w-full"
                        variant="outline"
                        onClick={() => handleCreateFoyerTogether(contact)}
                        disabled={loading}
                      >
                        → Créer "Famille {currentContact.nom}" ensemble
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
