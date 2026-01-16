import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Users, CheckCircle } from "lucide-react";
import { getAllContacts, deleteContact, type Contact } from "@/lib/api/tauri-contacts";
import { invoke } from "@tauri-apps/api/core";

interface ContactDeduplicateProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function ContactDeduplicate({ open, onOpenChange, onSuccess }: ContactDeduplicateProps) {
  const [deduplicating, setDeduplicating] = useState(false);
  const [result, setResult] = useState<{ merged: number; kept: number } | null>(null);

  const handleDeduplicate = async () => {
    setDeduplicating(true);
    setResult(null);

    try {
      const contacts = await getAllContacts();
      
      // Grouper les contacts par Nom + Prénom (insensible à la casse)
      const groups = new Map<string, Contact[]>();
      
      contacts.forEach(contact => {
        const key = `${contact.nom.toLowerCase()}_${contact.prenom.toLowerCase()}`;
        if (!groups.has(key)) {
          groups.set(key, []);
        }
        groups.get(key)!.push(contact);
      });

      let mergedCount = 0;
      let keptCount = 0;

      // Pour chaque groupe de doublons
      for (const [_, duplicates] of groups) {
        if (duplicates.length > 1) {
          // Trier par ID (garder le plus ancien)
          duplicates.sort((a, b) => a.id! - b.id!);
          
          const mainContact = duplicates[0];
          const otherContacts = duplicates.slice(1);

          // === RÈGLES DE FUSION INTELLIGENTES ===
          
          // 1. Date dernier contact : garder la PLUS RÉCENTE
          let mostRecentDate = mainContact.date_dernier_contact;
          duplicates.forEach(contact => {
            if (contact.date_dernier_contact && (!mostRecentDate || contact.date_dernier_contact > mostRecentDate)) {
              mostRecentDate = contact.date_dernier_contact;
            }
          });

          // 2. Catégorie : garder la PLUS AVANCÉE (CLIENT > PROSPECT > SUSPECT)
          const categorieOrder = {
            "CLIENT": 3,
            "PROSPECT_CLIENT": 2,
            "PROSPECT_FILLEUL": 2,
            "SUSPECT_CLIENT": 1,
            "SUSPECT_FILLEUL": 1,
          };
          
          let bestCategorie = mainContact.categorie;
          let bestCategorieScore = categorieOrder[mainContact.categorie as keyof typeof categorieOrder] || 0;
          
          duplicates.forEach(contact => {
            const score = categorieOrder[contact.categorie as keyof typeof categorieOrder] || 0;
            if (score > bestCategorieScore) {
              bestCategorie = contact.categorie;
              bestCategorieScore = score;
            }
          });

          // 3. Notes : fusionner toutes les notes
          let allNotes: string[] = [];
          
          // Ajouter les notes du contact principal s'il y en a
          if (mainContact.notes) {
            allNotes.push(mainContact.notes);
          }

          // Ajouter les notes des autres contacts
          otherContacts.forEach(contact => {
            if (contact.notes && contact.notes !== mainContact.notes) {
              allNotes.push(contact.notes);
            }
          });

          const consolidatedNotes = allNotes.length > 0 ? allNotes.join('\n---\n') : mainContact.notes;

          // Mettre à jour le contact principal avec toutes les infos fusionnées
          await invoke("update_contact", {
            id: mainContact.id,
            contact: {
              ...mainContact,
              date_dernier_contact: mostRecentDate,
              categorie: bestCategorie,
              notes: consolidatedNotes,
            },
          });

          // Supprimer les doublons
          for (const duplicate of otherContacts) {
            await deleteContact(duplicate.id!);
            mergedCount++;
          }

          keptCount++;
        }
      }

      setResult({ merged: mergedCount, kept: keptCount });
      
      // Attendre 2 secondes puis rafraîchir
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (error) {
      console.error("Error deduplicating:", error);
      alert("Erreur lors de la déduplication: " + String(error));
    } finally {
      setDeduplicating(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="h-5 w-5" />
            Dédupliquer les contacts
          </DialogTitle>
          <DialogDescription>
            Fusionner automatiquement les contacts ayant le même nom et prénom
          </DialogDescription>
        </DialogHeader>

        {!result ? (
          <div className="space-y-4">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-900">
                <strong>Cette action va :</strong>
              </p>
              <ul className="text-sm text-blue-800 mt-2 space-y-1 list-disc list-inside">
                <li>Détecter tous les contacts en double (même nom + prénom)</li>
                <li>Garder le contact le plus ancien (ID le plus bas)</li>
                <li>📅 Conserver la date de dernier contact <strong>la plus récente</strong></li>
                <li>🎯 Conserver la catégorie <strong>la plus avancée</strong> (CLIENT &gt; PROSPECT &gt; SUSPECT)</li>
                <li>📝 Fusionner toutes les notes avec séparateur</li>
                <li>🗑️ Supprimer les doublons</li>
              </ul>
            </div>

            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
              <p className="text-xs text-yellow-900">
                ⚠️ Cette action est irréversible. Assurez-vous d'avoir une sauvegarde si nécessaire.
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
              <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-900">
                  Déduplication terminée !
                </p>
                <p className="text-sm text-green-800 mt-1">
                  {result.merged} doublon{result.merged > 1 ? "s" : ""} fusionné{result.merged > 1 ? "s" : ""}
                </p>
                <p className="text-sm text-green-800">
                  {result.kept} contact{result.kept > 1 ? "s" : ""} conservé{result.kept > 1 ? "s" : ""}
                </p>
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {!result ? (
            <>
              <Button variant="outline" onClick={handleClose}>
                Annuler
              </Button>
              <Button onClick={handleDeduplicate} disabled={deduplicating}>
                {deduplicating ? "Déduplication en cours..." : "Dédupliquer"}
              </Button>
            </>
          ) : (
            <Button onClick={handleClose}>
              Fermer
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
