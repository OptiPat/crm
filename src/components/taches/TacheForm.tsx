import { useEffect, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactMultiSelect } from "@/components/contacts/ContactMultiSelect";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import {
  createTache,
  updateTache,
  type NewTache,
  type Tache,
  type TachePriorite,
} from "@/lib/api/tauri-taches";
import { dateInputToUnix, unixToDateInput } from "@/lib/dates/calendar-date";
import { toast } from "sonner";

interface TacheFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tache?: Tache | null;
  /** Contact pré-rempli et figé (ouverture depuis une fiche). */
  fixedContactId?: number;
  onSuccess?: () => void;
}

interface FormState {
  titre: string;
  description: string;
  dateEcheance: string;
  priorite: TachePriorite;
  contactIds: number[];
}

function buildState(tache?: Tache | null, fixedContactId?: number): FormState {
  const linked = tache?.contacts?.map((c) => c.contact_id) ?? [];
  // En création depuis une fiche, pré-rattacher ce contact.
  const contactIds =
    !tache && fixedContactId != null ? [fixedContactId] : linked;
  return {
    titre: tache?.titre ?? "",
    description: tache?.description ?? "",
    dateEcheance: tache?.date_echeance ? unixToDateInput(tache.date_echeance) : "",
    priorite: tache?.priorite ?? "NORMALE",
    contactIds,
  };
}

export function TacheForm({
  open,
  onOpenChange,
  tache,
  fixedContactId,
  onSuccess,
}: TacheFormProps) {
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [form, setForm] = useState<FormState>(buildState(tache, fixedContactId));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getAllContacts()
      .then((list) => {
        if (!cancelled) setContacts(list);
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (open) setForm(buildState(tache, fixedContactId));
  }, [open, tache?.id, fixedContactId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const titre = form.titre.trim();
    if (!titre) {
      toast.error("Le titre est obligatoire");
      return;
    }
    setLoading(true);
    try {
      const payload: NewTache = {
        contact_ids: form.contactIds,
        titre,
        description: form.description.trim() || null,
        date_echeance: dateInputToUnix(form.dateEcheance),
        priorite: form.priorite,
        statut: tache?.statut ?? "A_FAIRE",
      };
      if (tache) {
        await updateTache(tache.id, payload);
      } else {
        await createTache(payload);
      }
      onSuccess?.();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(`Erreur : ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{tache ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
          <DialogDescription>
            Un rappel simple, avec une échéance et un ou plusieurs contacts (facultatif).
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Titre *</Label>
            <Input
              value={form.titre}
              onChange={(e) => setForm({ ...form, titre: e.target.value })}
              placeholder="Ex. Rappeler pour le bilan retraite"
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Échéance</Label>
              <Input
                type="date"
                value={form.dateEcheance}
                onChange={(e) => setForm({ ...form, dateEcheance: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>Priorité</Label>
              <Select
                value={form.priorite}
                onValueChange={(v) => setForm({ ...form, priorite: v as TachePriorite })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="BASSE">Basse</SelectItem>
                  <SelectItem value="NORMALE">Normale</SelectItem>
                  <SelectItem value="HAUTE">Haute</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <ContactMultiSelect
            label="Contacts liés (facultatif)"
            hint="Une tâche peut concerner plusieurs contacts."
            contacts={contacts}
            value={form.contactIds}
            onChange={(ids) => setForm({ ...form, contactIds: ids })}
          />

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Détails éventuels…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
