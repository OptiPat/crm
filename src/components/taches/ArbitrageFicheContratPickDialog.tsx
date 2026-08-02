import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useEffect, useState } from "react";
import type { FicheConseilContratPickItem } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-resolve";

interface ArbitrageFicheContratPickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  contrats: FicheConseilContratPickItem[];
  suggestedInvestissementId?: number;
  onConfirm: (investissementId: number) => void;
}

export function ArbitrageFicheContratPickDialog({
  open,
  onOpenChange,
  contrats,
  suggestedInvestissementId,
  onConfirm,
}: ArbitrageFicheContratPickDialogProps) {
  const fallbackId = String(contrats[0]?.investissementId ?? "");
  const defaultId =
    suggestedInvestissementId != null &&
    contrats.some((c) => c.investissementId === suggestedInvestissementId)
      ? String(suggestedInvestissementId)
      : fallbackId;
  const [value, setValue] = useState(defaultId);

  useEffect(() => {
    if (open) setValue(defaultId);
  }, [open, defaultId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choisir le contrat</DialogTitle>
          <DialogDescription>
            Ce client a plusieurs contrats AV/PER éligibles. Sélectionnez celui pour lequel générer la
            fiche conseil.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="arbitrage-fiche-contrat">Contrat</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="arbitrage-fiche-contrat">
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {contrats.map((contrat) => (
                <SelectItem key={contrat.investissementId} value={String(contrat.investissementId)}>
                  {contrat.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            type="button"
            disabled={!value}
            onClick={() => {
              if (!value) return;
              onConfirm(Number.parseInt(value, 10));
              onOpenChange(false);
            }}
          >
            Continuer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
