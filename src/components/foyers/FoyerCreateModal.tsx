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
import { Plus, X } from "lucide-react";
import { type Contact, getAllContacts, updateContact } from "@/lib/api/tauri-contacts";
import { createFoyer } from "@/lib/api/tauri-foyers";
import { Badge } from "@/components/ui/badge";

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
  const [selectedContactId, setSelectedContactId] = useState<string>("");
  const [loading, setLoading] = useState(false);

  // Initialiser le nom du foyer avec "Famille + nom du contact"
  useEffect(() => {
    if (open && currentContact) {
      setFoyerName(`Famille ${currentContact.nom}`);
      // Le contact actuel est automatiquement Déclarant 1
      setMembers([{
        contact: currentContact,
        role: "DECLARANT_1"
      }]);
      loadAvailableContacts();
    }
  }, [open, currentContact]);

  const loadAvailableContacts = async () => {
    try {
      const allContacts = await getAllContacts();
      // Exclure les contacts qui ont déjà un foyer et le contact actuel
      const available = allContacts.filter(
        c => !c.foyer_id && c.id !== currentContact.id
      );
      setAvailableContacts(available);
    } catch (error) {
      console.error("Error loading contacts:", error);
    }
  };

  const handleAddMember = () => {
    if (!selectedContactId) return;

    const contact = availableContacts.find(c => c.id === Number(selectedContactId));
    if (!contact) return;

    setMembers([...members, { contact, role: "DECLARANT_2" }]);
    setAvailableContacts(availableContacts.filter(c => c.id !== contact.id));
    setSelectedContactId("");
  };

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
        await updateContact(member.contact.id!, {
          ...member.contact,
          foyer_id: newFoyer.id,
          role_foyer: member.role,
          date_naissance: member.contact.date_naissance 
            ? new Date(member.contact.date_naissance * 1000).toISOString() 
            : undefined,
          date_dernier_contact: member.contact.date_dernier_contact 
            ? new Date(member.contact.date_dernier_contact * 1000).toISOString() 
            : undefined,
          date_prochain_suivi: member.contact.date_prochain_suivi 
            ? new Date(member.contact.date_prochain_suivi * 1000).toISOString() 
            : undefined,
        });
      }

      onSuccess();
      onOpenChange(false);
      
      // Reset
      setFoyerName("");
      setMembers([]);
      setSelectedContactId("");
    } catch (error) {
      console.error("🏠 [FoyerCreateModal] ❌ Erreur:", error);
      alert("Erreur lors de la création du foyer: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const getRoleLabel = (role: string) => {
    switch (role) {
      case "DECLARANT_1": return "Déclarant 1";
      case "DECLARANT_2": return "Déclarant 2";
      case "ENFANT": return "Enfant";
      case "AUTRE": return "Autre membre";
      default: return role;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>➕ Créer un foyer</DialogTitle>
          <DialogDescription>
            Créez un nouveau foyer fiscal et ajoutez-y des membres
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
              placeholder="Famille DUPONT"
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
              <div className="flex gap-2">
                <Select
                  value={selectedContactId}
                  onValueChange={setSelectedContactId}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Sélectionner un contact..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availableContacts.map((contact) => (
                      <SelectItem key={contact.id} value={String(contact.id)}>
                        {contact.prenom} {contact.nom}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  onClick={handleAddMember}
                  disabled={!selectedContactId}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Ajouter
                </Button>
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
