import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

export function ScpiTrimestreGuideDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Guide bulletins SCPI trimestriels</DialogTitle>
          <DialogDescription>
            Parcours T1–T4 : PDF → OCR Mistral → prepare CRM → envoi Gmail → Journal.
          </DialogDescription>
        </DialogHeader>
        <ol className="space-y-3 text-sm text-muted-foreground list-decimal pl-4">
          <li>
            <strong className="text-foreground font-normal">PDF</strong> — Suivi → Envois →
            checklist SCPI → <strong className="text-foreground font-normal">Préparer</strong>.
            Sélectionnez les bulletins reçus (un ou plusieurs). Le nom de fichier doit correspondre
            au <code className="text-xs">nom_produit</code> SCPI dans le CRM.
          </li>
          <li>
            <strong className="text-foreground font-normal">OCR + résumé</strong> — Mistral lit
            chaque PDF et produit un digest client. Clé API : Paramètres → Newsletter.
          </li>
          <li>
            <strong className="text-foreground font-normal">Prepare CRM</strong> — remplit Suivi →
            Envois → Prêts. Contrôler 1 aperçu avant envoi groupé.
          </li>
          <li>
            <strong className="text-foreground font-normal">Envoi</strong> — individuel ou
            sélection groupée. Historique dans <strong>Journal</strong> (pas Envoyés / À relancer
            pour les bulletins SCPI).
          </li>
        </ol>
        <p className="text-xs text-muted-foreground border-t pt-3">
          Un nouveau prepare remet en file les contacts retirés (✕) — utile après correction du
          contenu ou au trimestre suivant.
        </p>
      </DialogContent>
    </Dialog>
  );
}
