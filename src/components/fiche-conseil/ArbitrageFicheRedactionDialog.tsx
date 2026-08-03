import { useCallback, useEffect, useMemo, useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  createFicheConseilRedactionPreset,
  getAllFicheConseilRedactionPresets,
  type FicheConseilRedactionPreset,
} from "@/lib/api/tauri-fiche-conseil-redaction";
import type { ArbitrageFicheGenerationPending } from "@/hooks/useArbitrageFicheConseil";
import {
  EMPTY_FICHE_CONSEIL_ARBITRAGE_REDACTION,
  FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS,
  isAvArbitrageRedaction,
  validateArbitrageRedactionInput,
  type FicheConseilArbitrageRedactionInput,
} from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-redaction-labels";
import { toast } from "sonner";

const PRESET_NONE = "__none__";

interface ArbitrageFicheRedactionDialogProps {
  open: boolean;
  generationContext: ArbitrageFicheGenerationPending | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (
    context: ArbitrageFicheGenerationPending,
    redaction: FicheConseilArbitrageRedactionInput
  ) => void;
}

export function ArbitrageFicheRedactionDialog({
  open,
  generationContext,
  onOpenChange,
  onConfirm,
}: ArbitrageFicheRedactionDialogProps) {
  const productKind = generationContext?.productKind ?? "AV";
  const isAv = isAvArbitrageRedaction(productKind);

  const [allPresets, setAllPresets] = useState<FicheConseilRedactionPreset[]>([]);
  const [presetId, setPresetId] = useState(PRESET_NONE);
  const [motif, setMotif] = useState("");
  const [supportsDesinvestis, setSupportsDesinvestis] = useState("");
  const [supportsInvestis, setSupportsInvestis] = useState("");
  const [allocationOperation, setAllocationOperation] = useState("");
  const [savePreset, setSavePreset] = useState(false);
  const [presetNom, setPresetNom] = useState("");
  const [loading, setLoading] = useState(false);

  const presets = useMemo(
    () => allPresets.filter((preset) => preset.product_kind === productKind),
    [allPresets, productKind]
  );

  const resetForm = useCallback(() => {
    setPresetId(PRESET_NONE);
    setMotif("");
    setSupportsDesinvestis("");
    setSupportsInvestis("");
    setAllocationOperation("");
    setSavePreset(false);
    setPresetNom("");
  }, []);

  useEffect(() => {
    if (!open) return;
    resetForm();
    void (async () => {
      try {
        setAllPresets(await getAllFicheConseilRedactionPresets());
      } catch {
        setAllPresets([]);
      }
    })();
  }, [open, resetForm]);

  const applyPreset = (id: string) => {
    setPresetId(id);
    if (id === PRESET_NONE) return;
    const preset = presets.find((p) => String(p.id) === id);
    if (!preset) return;
    setMotif(preset.motif);
    setSupportsDesinvestis(preset.supports_desinvestis);
    setSupportsInvestis(preset.supports_investis);
    setAllocationOperation(preset.allocation_operation);
  };

  const buildRedaction = (): FicheConseilArbitrageRedactionInput => ({
    motif: motif.trim(),
    supportsDesinvestis: supportsDesinvestis.trim(),
    supportsInvestis: supportsInvestis.trim(),
    allocationOperation: allocationOperation.trim(),
  });

  const handleConfirm = async () => {
    if (!generationContext) return;

    const redaction = buildRedaction();
    const missingLabel = validateArbitrageRedactionInput(productKind, redaction);
    if (missingLabel) {
      toast.error(`${missingLabel} est obligatoire.`);
      return;
    }

    setLoading(true);
    try {
      if (savePreset) {
        const nom = presetNom.trim();
        if (!nom) {
          toast.error("Indiquez un nom pour enregistrer ce texte — la fiche sera tout de même générée.");
        } else {
          try {
            await createFicheConseilRedactionPreset({
              nom,
              product_kind: productKind,
              motif: redaction.motif,
              supports_desinvestis: redaction.supportsDesinvestis,
              supports_investis: redaction.supportsInvestis,
              allocation_operation: redaction.allocationOperation,
            });
            toast.success("Texte enregistré dans la bibliothèque");
          } catch (error) {
            console.error(error);
            toast.error(
              `Enregistrement impossible : ${String(error)} — génération de la fiche en cours.`
            );
          }
        }
      }
      onConfirm(generationContext, redaction);
      onOpenChange(false);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && loading) return;
    onOpenChange(nextOpen);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Rédaction arbitrage {isAv ? "AV" : "PER"}</DialogTitle>
          <DialogDescription>
            Complétez {isAv ? "les blocs de rédaction" : "le bloc de rédaction"} de la fiche
            conseil. Vous pouvez charger un texte enregistré ou en sauvegarder un nouveau.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {presets.length > 0 ? (
            <div className="space-y-2">
              <Label htmlFor="fiche-redaction-preset">Texte enregistré</Label>
              <Select value={presetId} onValueChange={applyPreset}>
                <SelectTrigger id="fiche-redaction-preset">
                  <SelectValue placeholder="Choisir un texte…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={PRESET_NONE}>— Aucun —</SelectItem>
                  {presets.map((preset) => (
                    <SelectItem key={preset.id} value={String(preset.id)}>
                      {preset.nom}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ) : null}

          {isAv ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="fiche-redaction-motif">
                  {FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.motif}
                </Label>
                <Textarea
                  id="fiche-redaction-motif"
                  value={motif}
                  onChange={(e) => setMotif(e.target.value)}
                  rows={4}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiche-redaction-desinvestis">
                  {FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.supportsDesinvestis}
                </Label>
                <Textarea
                  id="fiche-redaction-desinvestis"
                  value={supportsDesinvestis}
                  onChange={(e) => setSupportsDesinvestis(e.target.value)}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="fiche-redaction-investis">
                  {FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.supportsInvestis}
                </Label>
                <Textarea
                  id="fiche-redaction-investis"
                  value={supportsInvestis}
                  onChange={(e) => setSupportsInvestis(e.target.value)}
                  rows={3}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="fiche-redaction-allocation">
                {FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.allocationOperation}
              </Label>
              <Textarea
                id="fiche-redaction-allocation"
                value={allocationOperation}
                onChange={(e) => setAllocationOperation(e.target.value)}
                rows={8}
                required
              />
            </div>
          )}

          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="fiche-redaction-save"
                checked={savePreset}
                onCheckedChange={(checked) => setSavePreset(checked === true)}
              />
              <Label htmlFor="fiche-redaction-save" className="font-normal">
                Enregistrer ce texte pour réutilisation
              </Label>
            </div>
            {savePreset ? (
              <div className="space-y-2">
                <Label htmlFor="fiche-redaction-preset-nom">Nom du texte</Label>
                <Input
                  id="fiche-redaction-preset-nom"
                  value={presetNom}
                  onChange={(e) => setPresetNom(e.target.value)}
                  placeholder="Ex. Rééquilibrage prudent"
                />
              </div>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button type="button" disabled={loading} onClick={() => void handleConfirm()}>
            Générer la fiche
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export { EMPTY_FICHE_CONSEIL_ARBITRAGE_REDACTION };
