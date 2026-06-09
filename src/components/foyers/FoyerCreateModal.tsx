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
import { X, Home } from "lucide-react";
import { type Contact, getAllContacts } from "@/lib/api/tauri-contacts";
import { createFoyer } from "@/lib/api/tauri-foyers";
import { linkContactToFoyer } from "@/lib/foyers/foyer-utils";
import { Badge } from "@/components/ui/badge";
import { ListSearchField } from "@/components/layout/ListSearchField";
import { contactMatchesSearch } from "@/lib/search-utils";

interface FoyerCreateModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentContact: Contact;
  onSuccess: () => void;
}

interface MemberWithRole {
  contact: Contact;
  role: string;
}

export function FoyerCreateModal({
  open,
  onOpenChange,
  currentContact,
  onSuccess,
}: FoyerCreateModalProps) {
  const [foyerName, setFoyerName] = useState("");
  const [members, setMembers] = useState<MemberWithRole[]>([]);
  const [availableContacts, setAvailableContacts] = useState<Contact[]>([]);
  const [memberSearch, setMemberSearch] = useState("");
  const [loading, setLoading] = useState(false);

  // Initialiser le nom du foyer avec "Foyer + nom du contact"
  useEffect(() => {
    if (open && currentContact) {
      setFoyerName(`Foyer ${currentContact.nom}`);
      // Le contact actuel est automatiquement Déclarant 1
      setMembers([{
        contact: currentContact,
        role: "DECLARANT_1"
      }]);
      setMemberSearch("");
      loadAvailableContacts();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialisation à l'ouverture du modal
  }, [open, currentContact]);

  // 🔥 Auto-update du nom du foyer quand les membres changent
  useEffect(() => {
    if (members.length > 0) {
      // Extraire les noms uniques
      const uniqueNoms = [...new Set(members.map(m => m.contact.nom.toUpperCase()))];
      uniqueNoms.sort(); // Trier alphabétiquement
      
      if (uniqueNoms.length === 1) {
        setFoyerName(`Foyer ${uniqueNoms[0]}`);
      } else {
        setFoyerName(`Foyer ${uniqueNoms.join(" - ")}`);
      }
    }
  }, [members]);

  const loadAvailableContacts = async () => {
    try {
      const allContacts = await getAllContacts();
      // Exclure les contacts qui ont déjà un foyer et le contact actuel
      const available = allContacts
        .filter(c => !c.foyer_id && c.id !== currentContact.id)
        // 🔥 Trier par ordre alphabétique (nom puis prénom)
        .sort((a, b) => {
          const nomCompare = a.nom.localeCompare(b.nom);
          if (nomCompare !== 0) return nomCompare;
          return a.prenom.localeCompare(b.prenom);
        });
      setAvailableContacts(available);
    } catch (error) {
      console.error("Error loading contacts:", error);
    }
  };

  const handleAddMember = (contact: Contact) => {
    if (members.some((m) => m.contact.id === contact.id)) return;

    setMembers((prev) => [...prev, { contact, role: "DECLARANT_2" }]);
    setAvailableContacts((prev) => prev.filter((c) => c.id !== contact.id));
    setMemberSearch("");
  };

  const filteredAvailable = availableContacts.filter((c) =>
    contactMatchesSearch(memberSearch, c)
  );

  const handleRemoveMember = (contactId: number) => {
    const member = members.find(m => m.contact.id === contactId);
    if (!member || member.contact.id === currentContact.id) return; // Ne pas supprimer le contact principal

    setMembers(members.filter(m => m.contact.id !== contactId));
    setAvailableContacts([...availableContacts, member.contact]);
  };

  const handleRoleChange = (contactId: number, newRole: string) => {
    setMembers(members.map(m => 
      m.contact.id === contactId ? { ...m, role: newRole } : m
    ));
  };

  const handleSubmit = async () => {
    if (!foyerName.trim()) {
      alert("Veuillez saisir un nom de foyer");
      return;
    }

    setLoading(true);
    try {
      const newFoyer = await createFoyer({
        nom: foyerName,
        type_foyer: "COUPLE",
        notes: `Créé depuis le contact ${currentContact.prenom} ${currentContact.nom}`,
      });

      for (const member of members) {
        await linkContactToFoyer(member.contact, newFoyer.id, member.role);
      }

      onSuccess();
      onOpenChange(false);
      
      // Reset
      setFoyerName("");
      setMembers([]);
      setMemberSearch("");
    } catch (error) {
      console.error("🏠 [FoyerCreateModal] ❌ Erreur:", error);
      alert("Erreur lors de la création du foyer: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Home className="h-5 w-5" />
            Créer un foyer
          </DialogTitle>
          <DialogDescription>
            Couple seul ou plusieurs membres (conjoint, enfants) — un seul
            parcours pour créer le foyer et y rattacher les contacts.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Nom du foyer */}
          <div className="space-y-2">
            <Label htmlFor="foyerName">Nom du foyer</Label>
            <Input
              id="foyerName"
              value={foyerName}
              onChange={(e) => setFoyerName(e.target.value)}
              placeholder="Foyer (nom du foyer)"
            />
          </div>

          {/* Membres actuels */}
          <div className="space-y-2">
            <Label>Membres du foyer</Label>
            <div className="space-y-2">
              {members.map((member) => (
                <div
                  key={member.contact.id}
                  className="flex items-center justify-between p-3 border rounded-lg bg-accent/50"
                >
                  <div className="flex items-center gap-3 flex-1">
                    <span className="font-medium">
                      {member.contact.prenom} {member.contact.nom}
                    </span>
                    {member.contact.id === currentContact.id && (
                      <Badge variant="secondary" className="text-xs">
                        Contact actuel
                      </Badge>
                    )}
                  </div>
                  
                  <div className="flex items-center gap-2">
                    <Select
                      value={member.role}
                      onValueChange={(value) => handleRoleChange(member.contact.id!, value)}
                    >
                      <SelectTrigger className="w-[150px]">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="DECLARANT_1">Déclarant 1</SelectItem>
                        <SelectItem value="DECLARANT_2">Déclarant 2</SelectItem>
                        <SelectItem value="ENFANT">Enfant</SelectItem>
                        <SelectItem value="AUTRE">Autre membre</SelectItem>
                      </SelectContent>
                    </Select>

                    {member.contact.id !== currentContact.id && (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMember(member.contact.id!)}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Ajouter un membre */}
          {availableContacts.length > 0 && (
            <div className="space-y-2">
              <Label>Ajouter un membre</Label>
              <p className="text-xs text-muted-foreground">
                Recherchez puis cliquez sur un contact pour l&apos;ajouter à la liste.
              </p>
              <ListSearchField
                value={memberSearch}
                onChange={setMemberSearch}
                placeholder="Nom, prénom, email…"
                className="w-full"
              />
              <div className="max-h-44 overflow-y-auto space-y-1 rounded-md border border-border/70 p-1">
                {filteredAvailable.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-4 px-2">
                    {memberSearch
                      ? "Aucun contact sans foyer ne correspond"
                      : "Saisissez un nom pour rechercher"}
                  </p>
                ) : (
                  filteredAvailable.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      className="w-full text-left rounded-md px-3 py-2 text-sm hover:bg-accent transition-colors"
                      onClick={() => handleAddMember(contact)}
                    >
                      <span className="font-medium">
                        {contact.prenom} {contact.nom}
                      </span>
                      {contact.email && (
                        <span className="block text-xs text-muted-foreground truncate">
                          {contact.email}
                        </span>
                      )}
                    </button>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={handleSubmit} disabled={loading}>
            {loading ? "Création..." : "Créer le foyer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
