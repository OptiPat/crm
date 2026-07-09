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
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import {
  createInteraction,
  updateInteraction,
  INTERACTION_TYPES,
  type InteractionWithContact,
  type NewInteraction,
} from "@/lib/api/tauri-interactions";
import { touchContactAfterInteraction } from "@/lib/interactions/touch-contact-after-interaction";
import { notifyRelationChanged } from "@/lib/etiquettes/etiquette-events";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { STACKED_NESTED_SHEET_Z } from "@/lib/ui/stacked-sheet-layers";
import { PortalLayerProvider } from "@/lib/ui/portal-layer-context";

interface InteractionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interaction?: InteractionWithContact | null;
  defaultContactId?: number;
  onSuccess?: () => void;
  nestedSheet?: boolean;
}

function toLocalDatetimeInput(ts?: number): string {
  const d = ts ? new Date(ts * 1000) : new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function localDatetimeToIso(value: string): string {
  return new Date(value).toISOString();
}

function emptyForm(defaultContactId?: number): NewInteraction & { date_interaction: string } {
  return {
    contact_id: defaultContactId || 0,
    type_interaction: "APPEL",
    sujet: "",
    contenu: "",
    date_interaction: toLocalDatetimeInput(),
  };
}

export function InteractionForm({
  open,
  onOpenChange,
  interaction,
  defaultContactId,
  onSuccess,
  nestedSheet = false,
}: InteractionFormProps) {
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [formData, setFormData] = useState(emptyForm(defaultContactId));

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
    if (!open) return;
    if (interaction) {
      setFormData({
        contact_id: interaction.contact_id,
        type_interaction: interaction.type_interaction,
        sujet: interaction.sujet || "",
        contenu: interaction.contenu || "",
        date_interaction: toLocalDatetimeInput(interaction.date_interaction),
      });
    } else {
      setFormData(emptyForm(defaultContactId));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (ré)initialise sur ouverture / changement d'id, pas pendant la saisie
  }, [open, interaction?.id, defaultContactId]);

  useEffect(() => {
    if (!open || interaction || defaultContactId) return;
    if (formData.contact_id === 0 && contacts[0]?.id) {
      setFormData((prev) => ({ ...prev, contact_id: contacts[0].id! }));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dépend de contacts.length, pas de l'identité du tableau contacts
  }, [open, interaction, defaultContactId, contacts.length, formData.contact_id]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.contact_id) {
      alert("Sélectionnez un contact");
      return;
    }
    setLoading(true);
    try {
      const dateIso = formData.date_interaction
        ? localDatetimeToIso(formData.date_interaction)
        : new Date().toISOString();
      const payload: NewInteraction = {
        contact_id: formData.contact_id,
        type_interaction: formData.type_interaction,
        sujet: formData.sujet?.trim() || undefined,
        contenu: formData.contenu?.trim() || undefined,
        date_interaction: dateIso,
      };
      if (interaction) {
        await updateInteraction(interaction.id, payload);
        await touchContactAfterInteraction(formData.contact_id, dateIso);
      } else {
        await createInteraction(payload);
        await touchContactAfterInteraction(formData.contact_id, dateIso);
      }
      notifyRelationChanged(formData.contact_id, {
        skipEtiquettesChanged: true,
        skipTimelineReload: true,
      });
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
    <Dialog open={open} onOpenChange={onOpenChange} modal={!nestedSheet}>
      <DialogContent
        hideOverlay={nestedSheet}
        className={cn("max-w-lg", nestedSheet && STACKED_NESTED_SHEET_Z)}
      >
        <PortalLayerProvider layer={nestedSheet ? "nested" : "default"}>
        <DialogHeader>
          <DialogTitle>
            {interaction ? "Modifier l'interaction" : "Nouvelle interaction"}
          </DialogTitle>
          <DialogDescription>
            Enregistrez un échange avec un contact (appel, RDV, note…)
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label>Contact *</Label>
            <Select
              value={formData.contact_id ? String(formData.contact_id) : ""}
              onValueChange={(v) =>
                setFormData({ ...formData, contact_id: Number(v) })
              }
              disabled={!!defaultContactId && !interaction}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un contact" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={String(c.id)}>
                    {c.prenom} {c.nom}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Type *</Label>
            <Select
              value={formData.type_interaction}
              onValueChange={(v) =>
                setFormData({ ...formData, type_interaction: v })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {INTERACTION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Date et heure</Label>
            <Input
              type="datetime-local"
              value={formData.date_interaction || ""}
              onChange={(e) =>
                setFormData({ ...formData, date_interaction: e.target.value })
              }
            />
          </div>

          <div className="space-y-2">
            <Label>Sujet</Label>
            <Input
              value={formData.sujet || ""}
              onChange={(e) => setFormData({ ...formData, sujet: e.target.value })}
              placeholder="Ex. Point trimestriel"
            />
          </div>

          <div className="space-y-2">
            <Label>Contenu</Label>
            <Textarea
              value={formData.contenu || ""}
              onChange={(e) => setFormData({ ...formData, contenu: e.target.value })}
              rows={4}
              placeholder="Compte-rendu de l'échange…"
            />
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" disabled={loading || contacts.length === 0}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
        </PortalLayerProvider>
      </DialogContent>
    </Dialog>
  );
}
