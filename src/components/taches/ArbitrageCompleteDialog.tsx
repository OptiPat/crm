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
import { ArbitrageCompleteFields } from "@/components/taches/ArbitrageCompleteFields";
import {
  defaultProchainArbitrageDateInput,
  type ArbitrageCompletePayload,
} from "@/lib/alertes/arbitrage-alerte";
import { dateInputToday } from "@/lib/taches/tache-date-shortcuts";

interface ArbitrageCompleteDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  submitting?: boolean;
  showConfirmAndNext?: boolean;
  onConfirm: (payload: ArbitrageCompletePayload) => void | Promise<void>;
  onConfirmAndNext?: (payload: ArbitrageCompletePayload) => void | Promise<void>;
}

export function ArbitrageCompleteDialog({
  open,
  onOpenChange,
  title,
  description,
  submitting = false,
  showConfirmAndNext = false,
  onConfirm,
  onConfirmAndNext,
}: ArbitrageCompleteDialogProps) {
  const [dateDernier, setDateDernier] = useState(() => dateInputToday());
  const [dateProchain, setDateProchain] = useState(() =>
    defaultProchainArbitrageDateInput()
  );
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) {
      const today = dateInputToday();
      setDateDernier(today);
      setDateProchain(defaultProchainArbitrageDateInput(today));
      setNote("");
    }
  }, [open]);

  const buildPayload = (): ArbitrageCompletePayload => ({
    dateDernier,
    dateProchain,
    note: note.trim() || undefined,
  });

  const canConfirm = Boolean(dateDernier && dateProchain);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <ArbitrageCompleteFields
          dateDernier={dateDernier}
          dateProchain={dateProchain}
          note={note}
          onDateDernierChange={setDateDernier}
          onDateProchainChange={setDateProchain}
          onNoteChange={setNote}
          disabled={submitting}
        />
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:gap-0">
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Annuler
          </Button>
          {showConfirmAndNext && onConfirmAndNext ? (
            <Button
              type="button"
              variant="secondary"
              disabled={!canConfirm || submitting}
              onClick={() => void onConfirmAndNext(buildPayload())}
            >
              {submitting ? "Enregistrement…" : "Confirmer et suivant"}
            </Button>
          ) : null}
          <Button
            type="button"
            disabled={!canConfirm || submitting}
            onClick={() => void onConfirm(buildPayload())}
          >
            {submitting ? "Enregistrement…" : "Confirmer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
