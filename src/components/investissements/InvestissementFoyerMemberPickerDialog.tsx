import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Users } from "lucide-react";
import type { Contact } from "@/lib/api/tauri-contacts";

type InvestissementFoyerMemberPickerDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  foyerNom: string;
  members: Contact[];
  onSelectContact: (contactId: number) => void;
  onOpenFoyer?: () => void;
};

export function InvestissementFoyerMemberPickerDialog({
  open,
  onOpenChange,
  foyerNom,
  members,
  onSelectContact,
  onOpenFoyer,
}: InvestissementFoyerMemberPickerDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Placement commun — {foyerNom}</DialogTitle>
          <DialogDescription>
            Ouvrez la fiche du foyer ou choisissez un membre pour consulter le
            patrimoine.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          {onOpenFoyer && (
            <Button
              type="button"
              variant="outline"
              className="w-full justify-start gap-2"
              onClick={() => {
                onOpenFoyer();
                onOpenChange(false);
              }}
            >
              <Users className="h-4 w-4 shrink-0" />
              Voir le foyer
            </Button>
          )}
          {members.map((member) => (
            <Button
              key={member.id}
              type="button"
              variant="secondary"
              className="w-full justify-start"
              onClick={() => {
                if (member.id) onSelectContact(member.id);
                onOpenChange(false);
              }}
            >
              {member.prenom} {member.nom}
            </Button>
          ))}
        </div>

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
