import { useCallback, useEffect, useState } from "react";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { datetimeLocalToUnix, unixToDatetimeLocalInput } from "@/lib/pipe/pipe-timeline-types";
import {
  createPlacementOperation,
  listPlacementOperationsForPipe,
  notifyPlacementOperationsChanged,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
  type PlacementOperation,
} from "@/lib/api/tauri-box-placement";
import {
  isStelliumLabelAllowedForProduct,
  placementOperationTypeFromStelliumLabel,
} from "@/lib/placement/stellium-box-placement-labels";
import { formatStelliumProductForDisplay } from "@/lib/placement/stellium-box-placement-products";
import { placementOperationIsSuiviDraft } from "@/lib/placement/suivi-placement-draft";
import { StelliumPlacementActFields } from "@/components/pipe/StelliumPlacementActFields";
import { toast } from "sonner";

interface PipeSuiviStelliumActAddProps {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe: Pick<PipeRecord, "id" | "contact_id">;
  onAdded?: () => void;
}

function formatDraftLabel(operation: PlacementOperation): string {
  const acte = operation.stellium_label?.trim();
  const produit = formatStelliumProductForDisplay(operation.product_label?.trim() ?? "");
  if (acte && produit) return `${acte} · ${produit}`;
  return acte || produit || "Acte Stellium";
}

export function PipeSuiviStelliumActAdd({ timeline, pipe, onAdded }: PipeSuiviStelliumActAddProps) {
  const [drafts, setDrafts] = useState<PlacementOperation[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [stelliumLabel, setStelliumLabel] = useState("");
  const [productLabel, setProductLabel] = useState("");
  const [draftOccurredAt, setDraftOccurredAt] = useState<Record<number, string>>({});
  const [draftContenu, setDraftContenu] = useState<Record<number, string>>({});
  const [savingId, setSavingId] = useState<number | "new" | null>(null);

  const defaultOccurredAt = () => unixToDatetimeLocalInput();

  const syncDraftFields = useCallback((nextDrafts: PlacementOperation[]) => {
    const defaultAt = defaultOccurredAt();
    setDraftOccurredAt((prev) => {
      const next: Record<number, string> = {};
      for (const draft of nextDrafts) {
        next[draft.id] = prev[draft.id] ?? defaultAt;
      }
      return next;
    });
    setDraftContenu((prev) => {
      const next: Record<number, string> = {};
      for (const draft of nextDrafts) {
        next[draft.id] = prev[draft.id] ?? "";
      }
      return next;
    });
  }, []);

  const reloadDrafts = useCallback(async () => {
    try {
      const rows = await listPlacementOperationsForPipe(pipe.id);
      const nextDrafts = rows.filter(placementOperationIsSuiviDraft);
      setDrafts(nextDrafts);
      syncDraftFields(nextDrafts);
    } catch {
      setDrafts([]);
      setDraftOccurredAt({});
      setDraftContenu({});
    } finally {
      setLoadingDrafts(false);
    }
  }, [pipe.id, syncDraftFields]);

  useEffect(() => {
    void reloadDrafts();
    const onChanged = () => {
      void reloadDrafts();
    };
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
  }, [reloadDrafts]);

  const confirmStelliumSend = async (
    operation: PlacementOperation,
    options?: { occurredAt?: string; contenu?: string }
  ) => {
    const label = operation.stellium_label?.trim();
    const product = operation.product_label?.trim();
    if (!label || !product || pipe.contact_id <= 0) return;

    setSavingId(operation.id);
    try {
      const occurredAtUnix = datetimeLocalToUnix(options?.occurredAt ?? unixToDatetimeLocalInput());
      const entry = await timeline.addEntry({
        entry_type: "NOTE",
        titre: `${label} — ${product}`,
        contenu: options?.contenu?.trim() || null,
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
      toast.success("Envoi Stellium confirmé — en attente de réponse");
      onAdded?.();
    } catch (err) {
      console.error(err);
      toast.error(String(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = stelliumLabel.trim();
    const product = productLabel.trim();
    if (!label || !product || pipe.contact_id <= 0) return;
    if (!isStelliumLabelAllowedForProduct(label, product)) {
      toast.error("Acte incompatible avec le produit sélectionné");
      return;
    }
    setSavingId("new");
    try {
      await createPlacementOperation({
        contact_id: pipe.contact_id,
        pipe_id: pipe.id,
        operation_type: placementOperationTypeFromStelliumLabel(label),
        stellium_label: label,
        product_label: product,
      });
      notifyPlacementOperationsChanged();
      toast.success("Acte ajouté — confirmez l'envoi Stellium quand le dossier part");
      setOpenNew(false);
      setStelliumLabel("");
      setProductLabel("");
    } catch (err) {
      console.error(err);
      toast.error(String(err));
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
      <div>
        <p className="text-sm font-medium">Stellium — actes de gestion</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
          L&apos;acte est créé avec le suivi. Quand le dossier part chez Stellium (après signature
          client, etc.), confirmez l&apos;envoi pour passer en attente de réponse.
        </p>
      </div>

      {loadingDrafts ? (
        <p className="text-xs text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => (
            <div key={draft.id} className="rounded-md border bg-card p-3 space-y-3">
              <p className="text-sm font-medium">{formatDraftLabel(draft)}</p>
              <div className="space-y-2">
                <Label>Date d&apos;envoi chez Stellium</Label>
                <Input
                  type="datetime-local"
                  value={draftOccurredAt[draft.id] ?? defaultOccurredAt()}
                  onChange={(e) =>
                    setDraftOccurredAt((prev) => ({ ...prev, [draft.id]: e.target.value }))
                  }
                />
              </div>
              <DictationTextarea
                label="Détail (optionnel)"
                value={draftContenu[draft.id] ?? ""}
                onChange={(value) =>
                  setDraftContenu((prev) => ({ ...prev, [draft.id]: value }))
                }
                rows={2}
                placeholder="Montant, contexte…"
              />
              <Button
                type="button"
                size="sm"
                className="gap-1.5"
                disabled={savingId === draft.id}
                onClick={() =>
                  void confirmStelliumSend(draft, {
                    occurredAt: draftOccurredAt[draft.id],
                    contenu: draftContenu[draft.id],
                  })
                }
              >
                <Send className="h-3.5 w-3.5" />
                {savingId === draft.id ? "Enregistrement…" : "Confirmer l'envoi Stellium"}
              </Button>
            </div>
          ))}

          {!openNew ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => setOpenNew(true)}
            >
              <Plus className="h-3.5 w-3.5" />
              Autre acte Stellium
            </Button>
          ) : (
            <form onSubmit={(e) => void handleCreateDraft(e)} className="space-y-3 rounded-md border p-3">
              <StelliumPlacementActFields
                productLabel={productLabel}
                stelliumLabel={stelliumLabel}
                onProductChange={setProductLabel}
                onStelliumLabelChange={setStelliumLabel}
              />
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpenNew(false);
                    setStelliumLabel("");
                    setProductLabel("");
                  }}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={savingId === "new" || !stelliumLabel || !productLabel}
                >
                  {savingId === "new" ? "Enregistrement…" : "Ajouter l'acte"}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
