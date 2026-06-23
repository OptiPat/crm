import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ExchangeEmailReplyForm } from "@/components/interactions/ExchangeEmailReplyForm";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import { queueItemToExchangeReplyEntry } from "@/lib/emails/campaign-email-reply";

interface EtiquetteEmailReplyDialogProps {
  item: EtiquetteEmailQueueItem | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSent?: () => void;
}

export function EtiquetteEmailReplyDialog({
  item,
  open,
  onOpenChange,
  onSent,
}: EtiquetteEmailReplyDialogProps) {
  if (!item) return null;

  const entry = queueItemToExchangeReplyEntry(item);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Répondre à {item.contact_prenom} {item.contact_nom}
          </DialogTitle>
          <DialogDescription>
            Rédigez votre réponse — elle part dans le fil Gmail de l&apos;envoi campagne. Le suivi
            « en attente de réponse » se clôture après l&apos;envoi. Si le client a déjà répondu sans
            que vous écriviez ici, fermez cette fenêtre et utilisez « Réponse reçue » sur la ligne.
          </DialogDescription>
        </DialogHeader>
        <ExchangeEmailReplyForm
          entry={entry}
          queueRowKind={item.queue_row_kind ?? "etiquette"}
          compact
          onSent={() => {
            onSent?.();
            onOpenChange(false);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
