import { useState } from "react";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { datetimeLocalToUnix, unixToDatetimeLocalInput } from "@/lib/pipe/pipe-timeline-types";
import {
  createPlacementOperation,
  notifyPlacementOperationsChanged,
} from "@/lib/api/tauri-box-placement";
import {
  placementOperationTypeFromStelliumLabel,
  STELLIUM_BOX_PLACEMENT_LABEL_GROUPS,
} from "@/lib/placement/stellium-box-placement-labels";
import { STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS } from "@/lib/placement/stellium-box-placement-products";
import { toast } from "sonner";

interface PipeSuiviStelliumActAddProps {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe: Pick<PipeRecord, "id" | "contact_id">;
  onAdded?: () => void;
}

export function PipeSuiviStelliumActAdd({ timeline, pipe, onAdded }: PipeSuiviStelliumActAddProps) {
  const [open, setOpen] = useState(false);
  const [stelliumLabel, setStelliumLabel] = useState("");
  const [productLabel, setProductLabel] = useState("");
  const [occurredAt, setOccurredAt] = useState(() => unixToDatetimeLocalInput());
  const [contenu, setContenu] = useState("");
  const [saving, setSaving] = useState(false);

  const cancel = () => {
    setOpen(false);
    setStelliumLabel("");
    setProductLabel("");
    setContenu("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = stelliumLabel.trim();
    const product = productLabel.trim();
    if (!label || !product || pipe.contact_id <= 0) return;
    setSaving(true);
    try {
      const occurredAtUnix = datetimeLocalToUnix(occurredAt);
      const entry = await timeline.addEntry({
        entry_type: "NOTE",
        titre: `${label} — ${product}`,
        contenu: contenu.trim() || null,
        occurred_at: occurredAtUnix,
      });
      await createPlacementOperation({
        contact_id: pipe.contact_id,
        pipe_id: pipe.id,
        pipe_timeline_entry_id: entry.id,
        operation_type: placementOperationTypeFromStelliumLabel(label),
        stellium_label: label,
        product_label: product,
      });
      notifyPlacementOperationsChanged();
      toast.success("Acte partenaire — en attente Stellium");
      cancel();
      onAdded?.();
    } catch (err) {
      console.error(err);
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
      <div>
        <p className="text-sm font-medium">Envoi partenaire Stellium</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          Libellé et produit comme dans le mail Box Placement. Vous pouvez déclarer plusieurs actes
          sur ce suivi (même libellé si le produit diffère).
        </p>
      </div>

      {!open ? (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 gap-1 text-xs"
          onClick={() => setOpen(true)}
        >
          <Send className="h-3.5 w-3.5" />
          Déclarer un acte de gestion
        </Button>
      ) : (
        <form onSubmit={(e) => void handleSubmit(e)} className="space-y-3">
          <div className="space-y-2">
            <Label>Type d&apos;opération (libellé Stellium)</Label>
            <Select value={stelliumLabel} onValueChange={setStelliumLabel}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner l'acte envoyé chez Stellium…" />
              </SelectTrigger>
              <SelectContent className="max-h-[min(24rem,70vh)]">
                {STELLIUM_BOX_PLACEMENT_LABEL_GROUPS.map((group) => (
                  <SelectGroup key={group.id}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.items.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Produit / contrat</Label>
            <Select value={productLabel} onValueChange={setProductLabel}>
              <SelectTrigger>
                <SelectValue placeholder="Sélectionner le produit Stellium…" />
              </SelectTrigger>
              <SelectContent className="max-h-[min(24rem,70vh)]">
                {STELLIUM_BOX_PLACEMENT_PRODUCT_GROUPS.map((group) => (
                  <SelectGroup key={group.id}>
                    <SelectLabel>{group.label}</SelectLabel>
                    {group.items.map((item) => (
                      <SelectItem key={item} value={item}>
                        {item}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Date et heure de déclaration</Label>
            <Input
              type="datetime-local"
              value={occurredAt}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </div>
          <DictationTextarea
            label="Détail (optionnel)"
            value={contenu}
            onChange={setContenu}
            rows={2}
            placeholder="Montant, contexte…"
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" size="sm" onClick={cancel}>
              Annuler
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={saving || !stelliumLabel || !productLabel}
            >
              {saving ? "Enregistrement…" : "Confirmer l'envoi partenaire"}
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
