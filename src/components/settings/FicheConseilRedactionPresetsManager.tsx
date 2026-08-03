import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import type { ArbitrageFicheProductKind } from "@/lib/api/tauri-arbitrage-fiche";
import {
  createFicheConseilRedactionPreset,
  deleteFicheConseilRedactionPreset,
  getAllFicheConseilRedactionPresets,
  updateFicheConseilRedactionPreset,
  type FicheConseilRedactionPreset,
} from "@/lib/api/tauri-fiche-conseil-redaction";
import {
  FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS,
  isAvArbitrageRedaction,
} from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-redaction-labels";

type Draft = {
  nom: string;
  motif: string;
  supports_desinvestis: string;
  supports_investis: string;
  allocation_operation: string;
};

const emptyDraft = (): Draft => ({
  nom: "",
  motif: "",
  supports_desinvestis: "",
  supports_investis: "",
  allocation_operation: "",
});

type FicheConseilRedactionPresetsManagerProps = {
  productKind: ArbitrageFicheProductKind;
  title: string;
  description: string;
};

export function FicheConseilRedactionPresetsManager({
  productKind,
  title,
  description,
}: FicheConseilRedactionPresetsManagerProps) {
  const isAv = isAvArbitrageRedaction(productKind);
  const [allPresets, setAllPresets] = useState<FicheConseilRedactionPreset[]>([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState<number | "new" | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft());
  const [saving, setSaving] = useState(false);

  const presets = useMemo(
    () => allPresets.filter((preset) => preset.product_kind === productKind),
    [allPresets, productKind]
  );

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setAllPresets(await getAllFicheConseilRedactionPresets());
    } catch {
      setAllPresets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const startCreate = () => {
    setEditingId("new");
    setDraft(emptyDraft());
  };

  const startEdit = (preset: FicheConseilRedactionPreset) => {
    setEditingId(preset.id);
    setDraft({
      nom: preset.nom,
      motif: preset.motif,
      supports_desinvestis: preset.supports_desinvestis,
      supports_investis: preset.supports_investis,
      allocation_operation: preset.allocation_operation,
    });
  };

  const cancelEdit = () => {
    setEditingId(null);
    setDraft(emptyDraft());
  };

  const handleSave = async () => {
    const nom = draft.nom.trim();
    if (!nom) {
      toast.error("Le nom est obligatoire.");
      return;
    }
    if (isAv) {
      if (!draft.motif.trim()) {
        toast.error(`${FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.motif} est obligatoire.`);
        return;
      }
    } else if (!draft.allocation_operation.trim()) {
      toast.error(`${FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.allocationOperation} est obligatoire.`);
      return;
    }

    const payload = {
      nom,
      product_kind: productKind,
      motif: draft.motif.trim(),
      supports_desinvestis: draft.supports_desinvestis.trim(),
      supports_investis: draft.supports_investis.trim(),
      allocation_operation: draft.allocation_operation.trim(),
    };

    setSaving(true);
    try {
      if (editingId === "new") {
        await createFicheConseilRedactionPreset(payload);
        toast.success("Texte enregistré");
      } else if (editingId != null) {
        await updateFicheConseilRedactionPreset(editingId, payload);
        toast.success("Texte mis à jour");
      }
      cancelEdit();
      await refresh();
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (preset: FicheConseilRedactionPreset) => {
    try {
      await deleteFicheConseilRedactionPreset(preset.id);
      if (editingId === preset.id) cancelEdit();
      await refresh();
      toast.success("Texte supprimé");
    } catch (error) {
      toast.error(`Erreur : ${String(error)}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{title}</p>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button type="button" size="sm" variant="outline" onClick={startCreate}>
          <Plus className="mr-2 h-4 w-4" />
          Ajouter
        </Button>
      </div>

      {editingId != null ? (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="space-y-2">
            <Label htmlFor={`preset-nom-${productKind}`}>Nom</Label>
            <Input
              id={`preset-nom-${productKind}`}
              value={draft.nom}
              onChange={(e) => setDraft((d) => ({ ...d, nom: e.target.value }))}
            />
          </div>
          {isAv ? (
            <>
              <div className="space-y-2">
                <Label htmlFor={`preset-motif-${productKind}`}>
                  {FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.motif}
                </Label>
                <Textarea
                  id={`preset-motif-${productKind}`}
                  value={draft.motif}
                  onChange={(e) => setDraft((d) => ({ ...d, motif: e.target.value }))}
                  rows={4}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`preset-desinvestis-${productKind}`}>
                  {FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.supportsDesinvestis}
                </Label>
                <Textarea
                  id={`preset-desinvestis-${productKind}`}
                  value={draft.supports_desinvestis}
                  onChange={(e) => setDraft((d) => ({ ...d, supports_desinvestis: e.target.value }))}
                  rows={3}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={`preset-investis-${productKind}`}>
                  {FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.supportsInvestis}
                </Label>
                <Textarea
                  id={`preset-investis-${productKind}`}
                  value={draft.supports_investis}
                  onChange={(e) => setDraft((d) => ({ ...d, supports_investis: e.target.value }))}
                  rows={3}
                />
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <Label htmlFor={`preset-allocation-${productKind}`}>
                {FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.allocationOperation}
              </Label>
              <Textarea
                id={`preset-allocation-${productKind}`}
                value={draft.allocation_operation}
                onChange={(e) => setDraft((d) => ({ ...d, allocation_operation: e.target.value }))}
                rows={8}
              />
            </div>
          )}
          <div className="flex gap-2">
            <Button type="button" size="sm" disabled={saving} onClick={() => void handleSave()}>
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enregistrer
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={cancelEdit}>
              Annuler
            </Button>
          </div>
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-muted-foreground">Chargement…</p>
      ) : presets.length === 0 ? (
        <p className="text-sm text-muted-foreground">Aucun texte enregistré.</p>
      ) : (
        <ul className="divide-y rounded-lg border">
          {presets.map((preset) => (
            <li key={preset.id} className="flex items-center justify-between gap-2 p-3">
              <span className="text-sm font-medium">{preset.nom}</span>
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" onClick={() => startEdit(preset)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => void handleDelete(preset)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
