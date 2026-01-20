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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Users2, X } from "lucide-react";
import { type Contact, updateContact } from "@/lib/api/tauri-contacts";
import { createFoyer } from "@/lib/api/tauri-foyers";

interface ContactWithRole {
  contact: Contact;
  role: string;
}

interface FamilyGroup {
  familyName: string;
  members: ContactWithRole[];
  skip: boolean;
}

interface FoyerGroupingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  importedContacts: Contact[];
  onSuccess: () => void;
}

// 🧠 Fonction intelligente pour calculer l'âge à partir de la date de naissance
const calculateAge = (dateNaissance: number | undefined): number | null => {
  if (!dateNaissance) return null;
  const birthDate = new Date(dateNaissance * 1000);
  const today = new Date();
  let age = today.getFullYear() - birthDate.getFullYear();
  const monthDiff = today.getMonth() - birthDate.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birthDate.getDate())) {
    age--;
  }
  return age;
};

// 🧠 Fonction intelligente pour assigner les rôles basée sur les âges
const assignRolesIntelligently = (members: Contact[]): ContactWithRole[] => {
  // Calculer l'âge de chaque membre
  const membersWithAge = members.map(contact => ({
    contact,
    age: calculateAge(contact.date_naissance),
  }));

  // Séparer ceux avec et sans date de naissance
  const withAge = membersWithAge.filter(m => m.age !== null);
  const withoutAge = membersWithAge.filter(m => m.age === null);

  // Si personne n'a de date de naissance, fallback sur l'ordre d'origine
  if (withAge.length === 0) {
    return members.map((contact, index) => ({
      contact,
      role: index === 0 ? "DECLARANT_1" : index === 1 ? "DECLARANT_2" : "ENFANT",
    }));
  }

  // Trier par âge décroissant (plus vieux en premier)
  withAge.sort((a, b) => (b.age as number) - (a.age as number));

  const result: ContactWithRole[] = [];
  
  // Le plus vieux = Déclarant 1
  if (withAge.length >= 1) {
    result.push({ contact: withAge[0].contact, role: "DECLARANT_1" });
  }

  // Logique pour les autres membres
  for (let i = 1; i < withAge.length; i++) {
    const currentAge = withAge[i].age as number;
    const oldestAge = withAge[0].age as number;
    const ageDifference = oldestAge - currentAge;

    // Si écart d'âge > 18 ans avec le plus vieux → Enfant
    // Sinon, si c'est le 2ème et écart < 18 ans → Déclarant 2
    if (ageDifference > 18) {
      result.push({ contact: withAge[i].contact, role: "ENFANT" });
    } else if (i === 1) {
      result.push({ contact: withAge[i].contact, role: "DECLARANT_2" });
    } else {
      // 3ème personne avec écart < 18 ans (ex: frère/sœur du conjoint) → Autre
      result.push({ contact: withAge[i].contact, role: "AUTRE" });
    }
  }

  // Ajouter ceux sans date de naissance à la fin comme "AUTRE" (à vérifier manuellement)
  for (const member of withoutAge) {
    result.push({ contact: member.contact, role: "AUTRE" });
  }

  return result;
};

export function FoyerGroupingModal({
  open,
  onOpenChange,
  importedContacts,
  onSuccess,
}: FoyerGroupingModalProps) {
  const [groups, setGroups] = useState<FamilyGroup[]>([]);
  const [loading, setLoading] = useState(false);

  // Grouper les contacts par nom de famille au montage
  useEffect(() => {
    if (open && importedContacts.length > 0) {
      const familyMap = new Map<string, Contact[]>();

      importedContacts.forEach((contact) => {
        const familyName = contact.nom.toUpperCase();
        if (!familyMap.has(familyName)) {
          familyMap.set(familyName, []);
        }
        familyMap.get(familyName)!.push(contact);
      });

      // Ne garder que les familles avec 2+ membres
      const detectedGroups: FamilyGroup[] = [];
      familyMap.forEach((members, familyName) => {
        if (members.length >= 2) {
          // 🧠 Utiliser la détection intelligente des rôles
          const membersWithRoles = assignRolesIntelligently(members);
          
          detectedGroups.push({
            familyName,
            members: membersWithRoles,
            skip: false,
          });
        }
      });

      setGroups(detectedGroups);
    }
  }, [open, importedContacts]);

  const handleRoleChange = (groupIndex: number, memberIndex: number, newRole: string) => {
    const newGroups = [...groups];
    newGroups[groupIndex].members[memberIndex].role = newRole;
    setGroups(newGroups);
  };

  const handleSkipToggle = (groupIndex: number) => {
    const newGroups = [...groups];
    newGroups[groupIndex].skip = !newGroups[groupIndex].skip;
    setGroups(newGroups);
  };

  const handleRemoveMember = (groupIndex: number, memberIndex: number) => {
    const newGroups = [...groups];
    newGroups[groupIndex].members.splice(memberIndex, 1);
    
    // Si le groupe n'a plus qu'1 membre, le supprimer complètement
    if (newGroups[groupIndex].members.length < 2) {
      newGroups.splice(groupIndex, 1);
    }
    
    setGroups(newGroups);
  };

  const handleValidate = async () => {
    setLoading(true);
    try {
      for (const group of groups) {
        if (group.skip) {
          continue;
        }

        // Vérifier si les contacts ont déjà un foyer
        const membersWithFoyer = group.members.filter(m => m.contact.foyer_id);
        if (membersWithFoyer.length > 0) {
          // Utiliser le foyer existant au lieu d'en créer un nouveau
          const existingFoyerId = membersWithFoyer[0].contact.foyer_id!;
          
          // Rattacher les autres membres au foyer existant
          for (const member of group.members) {
            if (member.contact.foyer_id !== existingFoyerId) {
              await updateContact(member.contact.id!, {
                ...member.contact,
                foyer_id: existingFoyerId,
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
          }
          continue;
        }
        
        // Créer un foyer pour cette famille (aucun membre n'a de foyer)
        const foyer = await createFoyer({
          nom: `Famille ${group.familyName}`,
          type_foyer: "COUPLE",
          notes: "Créé automatiquement lors de l'import",
        });

        // Rattacher tous les membres au foyer
        for (const member of group.members) {
          await updateContact(member.contact.id!, {
            ...member.contact,
            foyer_id: foyer.id,
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
      }

      onSuccess();
      onOpenChange(false);
    } catch (error) {
      console.error("Erreur création foyers:", error);
      alert("Erreur lors de la création des foyers: " + String(error));
    } finally {
      setLoading(false);
    }
  };

  const handleIgnoreAll = () => {
    onSuccess();
    onOpenChange(false);
  };

  if (groups.length === 0) {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users2 className="h-5 w-5" />
            Foyers détectés
          </DialogTitle>
          <DialogDescription>
            {groups.length} famille{groups.length > 1 ? "s" : ""} avec plusieurs membres détectée{groups.length > 1 ? "s" : ""}. 
            Définissez le rôle de chaque personne ou ignorez si ce sont des homonymes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {groups.map((group, groupIndex) => (
            <div key={groupIndex} className="space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold text-lg">
                  📁 Famille {group.familyName} ({group.members.length} personnes)
                </h3>
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`skip-${groupIndex}`}
                    checked={group.skip}
                    onCheckedChange={() => handleSkipToggle(groupIndex)}
                  />
                  <Label 
                    htmlFor={`skip-${groupIndex}`}
                    className="text-sm font-normal cursor-pointer"
                  >
                    Ce sont des homonymes
                  </Label>
                </div>
              </div>

              <div 
                className={`space-y-2 rounded-lg border p-4 transition-opacity ${
                  group.skip ? "opacity-50 bg-muted" : ""
                }`}
              >
                {group.members.map((member, memberIndex) => (
                  <div
                    key={memberIndex}
                    className="flex items-center justify-between p-3 border rounded-lg bg-background"
                  >
                    <span className="font-medium">
                      {member.contact.prenom} {member.contact.nom}
                    </span>
                    <div className="flex items-center gap-2">
                      <Select
                        value={member.role}
                        onValueChange={(value) =>
                          handleRoleChange(groupIndex, memberIndex, value)
                        }
                        disabled={group.skip}
                      >
                        <SelectTrigger className="w-[160px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="DECLARANT_1">Déclarant 1</SelectItem>
                          <SelectItem value="DECLARANT_2">Déclarant 2</SelectItem>
                          <SelectItem value="ENFANT">Enfant</SelectItem>
                          <SelectItem value="AUTRE">Autre membre</SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleRemoveMember(groupIndex, memberIndex)}
                        disabled={group.skip}
                        className="h-8 w-8 text-muted-foreground hover:text-destructive"
                        title="Retirer du foyer"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>

              {groupIndex < groups.length - 1 && (
                <div className="border-t pt-4" />
              )}
            </div>
          ))}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="outline"
            onClick={handleIgnoreAll}
            disabled={loading}
          >
            Ignorer tout
          </Button>
          <Button
            onClick={handleValidate}
            disabled={loading}
          >
            {loading ? "Création en cours..." : "Valider les foyers"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
