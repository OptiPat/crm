import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Tache } from "@/lib/api/tauri-taches";
import type { ArbitrageFicheTemplate } from "@/lib/api/tauri-arbitrage-fiche";
import {
  resolveArbitrageFicheProductKind,
  type ArbitrageFicheProductKind,
} from "@/lib/alertes/arbitrage-alerte";
import { generateArbitrageFicheConseil } from "@/lib/pdf/arbitrage-fiche-conseil/generate-arbitrage-fiche";
import {
  requireArbitrageFicheTemplates,
  resolveArbitrageFicheTemplateForGeneration,
} from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-fiche-template";

export type ArbitrageFicheTemplatePickPending = {
  tache: Tache;
  productKind: ArbitrageFicheProductKind;
  templates: ArbitrageFicheTemplate[];
};

export function useArbitrageFicheConseil() {
  const [busy, setBusy] = useState(false);
  const [pendingPick, setPendingPick] = useState<ArbitrageFicheTemplatePickPending | null>(null);

  const runGeneration = useCallback(
    async (tache: Tache, templateId: string, productKind: ArbitrageFicheProductKind) => {
      setBusy(true);
      try {
        const { opened } = await generateArbitrageFicheConseil(tache, templateId, productKind);
        toast.success(
          opened
            ? "Fiche conseil générée dans Téléchargements"
            : "Fiche conseil enregistrée dans Téléchargements (ouverture impossible)"
        );
      } catch (error) {
        console.error(error);
        toast.error(`Erreur : ${String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    []
  );

  const startFicheConseil = useCallback(
    async (tache: Tache) => {
      if (busy || pendingPick) return;
      const productKind = resolveArbitrageFicheProductKind(tache);
      if (!productKind) return;

      setBusy(true);
      try {
        const templates = await requireArbitrageFicheTemplates(productKind);
        const resolved = resolveArbitrageFicheTemplateForGeneration(templates);
        if (resolved) {
          await runGeneration(tache, resolved.id, productKind);
          return;
        }
        setPendingPick({ tache, productKind, templates });
      } catch (error) {
        console.error(error);
        toast.error(`Erreur : ${String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, pendingPick, runGeneration]
  );

  const confirmTemplatePick = useCallback(
    (templateId: string) => {
      const pending = pendingPick;
      setPendingPick(null);
      if (pending) void runGeneration(pending.tache, templateId, pending.productKind);
    },
    [pendingPick, runGeneration]
  );

  return {
    startFicheConseil,
    pendingPick,
    setPendingPick,
    confirmTemplatePick,
    busy,
  };
}
