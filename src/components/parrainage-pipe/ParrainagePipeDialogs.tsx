import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
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
import { ParrainageContactSelect } from "@/components/parrainage-pipe/ParrainageContactSelect";
import { PipeProspectionContactSection } from "@/components/pipe/PipeProspectionContactSection";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { createParrainagePipe } from "@/lib/api/tauri-parrainage-pipe";
import {
  PARRAINAGE_INVITATION_LABELS,
  PARRAINAGE_INVITATION_TYPES,
  type ParrainageInvitationType,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";
import { toast } from "sonner";

interface ParrainagePipeCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  exerciceLabel: string;
  onCreated: () => void;
}

export function ParrainagePipeCreateDialog({
  open,
  onOpenChange,
  exerciceLabel,
  onCreated,
}: ParrainagePipeCreateDialogProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [contactId, setContactId] = useState(0);
  const [invitationType, setInvitationType] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    void getAllContacts().then(setContacts).catch(() => setContacts([]));
    setContactId(0);
    setInvitationType("");
  }, [open]);

  const handleCreate = async () => {
    if (!contactId) {
      toast.error("Choisissez un contact");
      return;
    }
    setSaving(true);
    try {
      await createParrainagePipe({
        contact_id: contactId,
        exercice_label: exerciceLabel,
        stage: "A_CONTACTER",
        invitation_type: invitationType || null,
      });
      toast.success("Contact ajouté au pipe");
      onCreated();
      onOpenChange(false);
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Ajouter au pipe parrainage</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <ParrainageContactSelect
            contacts={contacts}
            value={contactId}
            onChange={setContactId}
            onContactCreated={(contact) => {
              setContacts((prev) => [contact, ...prev]);
              setContactId(contact.id ?? 0);
            }}
          />
          {contactId > 0 && (
            <PipeProspectionContactSection contactId={contactId} layout="stack" />
          )}
          <div className="space-y-2">
            <Label>Type d&apos;invitation (optionnel)</Label>
            <Select value={invitationType || "none"} onValueChange={(v) => setInvitationType(v === "none" ? "" : v)}>
              <SelectTrigger>
                <SelectValue placeholder="JD ou PO" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">À définir plus tard</SelectItem>
                {PARRAINAGE_INVITATION_TYPES.map((type) => (
                  <SelectItem key={type} value={type}>
                    {PARRAINAGE_INVITATION_LABELS[type]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="text-xs text-muted-foreground">
            Exercice ciblé : <span className="font-medium">{exerciceLabel}</span>
          </p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Annuler
          </Button>
          <Button onClick={() => void handleCreate()} disabled={saving}>
            Ajouter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

interface ParrainagePipeStageDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  targetStageLabel: string;
  currentInvitationType?: string | null;
  onConfirm: (invitationType: ParrainageInvitationType) => void;
}

export function ParrainagePipeStageDialog({
  open,
  onOpenChange,
  targetStageLabel,
  currentInvitationType,
  onConfirm,
}: ParrainagePipeStageDialogProps) {
  const [invitationType, setInvitationType] = useState<ParrainageInvitationType>("JD");

  useEffect(() => {
    if (currentInvitationType === "JD" || currentInvitationType === "PO") {
      setInvitationType(currentInvitationType);
    } else {
      setInvitationType("JD");
    }
  }, [open, currentInvitationType]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invitation JD ou PO</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Pour passer à « {targetStageLabel} », indiquez le type d&apos;invitation.
        </p>
        <div className="space-y-2 py-2">
          <Label>Type d&apos;invitation</Label>
          <Select value={invitationType} onValueChange={(v) => setInvitationType(v as ParrainageInvitationType)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PARRAINAGE_INVITATION_TYPES.map((type) => (
                <SelectItem key={type} value={type}>
                  {PARRAINAGE_INVITATION_LABELS[type]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button onClick={() => onConfirm(invitationType)}>Confirmer</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
