import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SCPI_PDF_DROP_FOLDER } from "@/lib/emails/scpi-envois-filters";

export function ScpiTrimestreGuideDialog({
  open,
  onOpenChange,
  onCopyDropFolder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCopyDropFolder?: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Guide bulletins SCPI trimestriels</DialogTitle>
          <DialogDescription>
            Parcours T1–T4 : PDF → n8n → prepare CRM → envoi Gmail → Journal.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm text-muted-foreground list-decimal pl-4">
          <li>
            <strong className="text-foreground font-normal">PDF</strong> — déposer dans{" "}
            <code className="text-xs">{SCPI_PDF_DROP_FOLDER}</code>
            {onCopyDropFolder ? (
              <>
                {" "}
                (
                <button
                  type="button"
                  className="text-primary underline"
                  onClick={onCopyDropFolder}
                >
                  copier le chemin
                </button>
                )
              </>
            ) : null}
            . Nom de fichier = nom SCPI CRM reconnu.
          </li>
          <li>
            <strong className="text-foreground font-normal">n8n</strong> — workflow Mistral +
            POST prepare (token Paramètres → Intégrations). Bouton « Lancer workflow n8n »
            dans la checklist.
          </li>
          <li>
            <strong className="text-foreground font-normal">Prepare CRM</strong> — remplit Suivi
            → Envois → Prêts. Contrôler 1 aperçu avant envoi groupé.
          </li>
          <li>
            <strong className="text-foreground font-normal">Envoi</strong> — individuel ou
            sélection groupée. Historique dans <strong>Journal</strong> (pas Envoyés / À
            relancer pour les bulletins SCPI).
          </li>
        </ol>
        <p className="text-xs text-muted-foreground border-t pt-3">
          Un nouveau prepare remet en file les contacts retirés (✕) — utile après correction
          n8n ou relance trimestre suivant.
        </p>
      </DialogContent>
    </Dialog>
  );
}
