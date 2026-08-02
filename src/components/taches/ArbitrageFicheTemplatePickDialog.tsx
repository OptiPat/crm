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
import type { ArbitrageFicheTemplate } from "@/lib/api/tauri-arbitrage-fiche";

interface ArbitrageFicheTemplatePickDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  templates: ArbitrageFicheTemplate[];
  onConfirm: (templateId: string) => void;
}

export function ArbitrageFicheTemplatePickDialog({
  open,
  onOpenChange,
  templates,
  onConfirm,
}: ArbitrageFicheTemplatePickDialogProps) {
  const defaultId = templates.find((t) => t.isDefault)?.id ?? templates[0]?.id ?? "";
  const [value, setValue] = useState(defaultId);

  useEffect(() => {
    if (open) setValue(defaultId);
  }, [open, defaultId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Choisir le modèle</DialogTitle>
          <DialogDescription>
            Sélectionnez la fiche conseil pré-remplie à utiliser. Seuls le nom du client et le
            numéro de contrat seront ajoutés.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2 py-2">
          <Label htmlFor="arbitrage-fiche-template">Modèle PDF</Label>
          <Select value={value} onValueChange={setValue}>
            <SelectTrigger id="arbitrage-fiche-template">
              <SelectValue placeholder="Sélectionner…" />
            </SelectTrigger>
            <SelectContent>
              {templates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  {template.label}
                  {template.isDefault ? " (par défaut)" : ""}
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
              onConfirm(value);
              onOpenChange(false);
            }}
          >
            Générer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
