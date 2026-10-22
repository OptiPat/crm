import { useEffect, useRef, useState } from "react";
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
import {
  nestedStackedDialogClass,
  nestedStackedOutsideHandlers,
  nestedStackedPortalLayer,
} from "@/lib/ui/nested-stacked-dialog";
import {
  stopWheelPropagation,
  useLockAppMainScroll,
} from "@/lib/ui/nested-sheet-scroll";
import { PortalLayerProvider } from "@/lib/ui/portal-layer-context";
import { TeamLockBanner } from "@/components/team/TeamLockBanner";
import { useTeamFormRecordLock } from "@/hooks/useTeamFormRecordLock";
import { useUnsavedCloseGuard } from "@/hooks/useUnsavedCloseGuard";
import { PipeContactSelect } from "@/components/pipe/PipeContactSelect";
import { userErrorMessage } from "@/lib/api/invoke-error";

interface InteractionFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  interaction?: InteractionWithContact | null;
  /** Contact imposé à la création (fiche contact, filtre par contact) : non modifiable. */
  defaultContactId?: number;
  /** Contact proposé à la création mais modifiable (ex. échange sélectionné dans le journal). */
  initialContactId?: number;
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
  initialContactId,
  onSuccess,
  nestedSheet = false,
}: InteractionFormProps) {
  useLockAppMainScroll(open && nestedSheet);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [formData, setFormData] = useState(emptyForm(defaultContactId));
  const teamLock = useTeamFormRecordLock({
    open,
    onOpenChange,
    entityType: "interaction",
    entityId: interaction?.id,
  });
  const closeGuard = useUnsavedCloseGuard({
    open,
    onClose: () => onOpenChange(false),
    stacked: nestedSheet,
  });
  const [contactError, setContactError] = useState(false);
  // Lu seulement à l'ouverture : changer la sélection du journal ne doit pas vider la saisie.
  const initialContactIdRef = useRef(initialContactId);
  initialContactIdRef.current = initialContactId;

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
      setFormData(emptyForm(defaultContactId ?? initialContactIdRef.current));
    }
    setContactError(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- (ré)initialise sur ouverture / changement d'id, pas pendant la saisie
  }, [open, interaction?.id, defaultContactId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamLock.ready) return;
    if (!formData.contact_id) {
      setContactError(true);
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
      closeGuard.resetDirty();
      onOpenChange(false);
    } catch (error) {
      console.error(error);
      toast.error(userErrorMessage(error, "Impossible d'enregistrer l'interaction"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
    <Dialog open={open} onOpenChange={closeGuard.handleOpenChange} modal={!nestedSheet}>
      <DialogContent
        hideOverlay={nestedSheet}
        className={nestedStackedDialogClass(
          "flex max-h-[90vh] max-w-lg flex-col overflow-hidden",
          nestedSheet
        )}
        onWheel={nestedSheet ? stopWheelPropagation : undefined}
        {...nestedStackedOutsideHandlers(nestedSheet)}
      >
        <PortalLayerProvider layer={nestedStackedPortalLayer(nestedSheet)}>
        <DialogHeader className="shrink-0">
          <DialogTitle>
            {interaction ? "Modifier l'interaction" : "Nouvelle interaction"}
          </DialogTitle>
          <DialogDescription>
            Enregistrez un échange avec un contact (appel, RDV, note…)
          </DialogDescription>
        </DialogHeader>
        <TeamLockBanner
          heldBy={teamLock.heldBy}
          loading={teamLock.loading}
          message={teamLock.error}
        />

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          onWheel={nestedSheet ? stopWheelPropagation : undefined}
        >
        <form onSubmit={handleSubmit} className="space-y-4" {...closeGuard.trackDirtyProps}>
          <div className="space-y-1">
            <PipeContactSelect
              contacts={contacts}
              value={formData.contact_id}
              onChange={(contactId) => {
                setFormData((prev) => ({ ...prev, contact_id: contactId }));
                setContactError(false);
              }}
              disabled={!!defaultContactId && !interaction}
              placeholder="Choisir un contact…"
              showCreateButton={false}
            />
            {contactError && (
              <p className="text-xs text-destructive">Choisissez un contact</p>
            )}
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

          <DialogFooter data-no-dirty>
            <Button type="button" variant="outline" onClick={closeGuard.requestClose}>
              Annuler
            </Button>
            <Button
              type="submit"
              disabled={loading || contacts.length === 0 || !teamLock.ready}
            >
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
        </div>
        </PortalLayerProvider>
      </DialogContent>
    </Dialog>
    {closeGuard.discardDialog}
    </>
  );
}
