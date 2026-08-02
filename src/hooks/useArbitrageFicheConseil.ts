import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Tache } from "@/lib/api/tauri-taches";
import type { ArbitrageFicheTemplate } from "@/lib/api/tauri-arbitrage-fiche";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import {
  isFicheConseilTask,
  parseArbitrageInvestissementId,
  type ArbitrageFicheProductKind,
} from "@/lib/alertes/arbitrage-alerte";
import { generateArbitrageFicheConseil } from "@/lib/pdf/arbitrage-fiche-conseil/generate-arbitrage-fiche";
import {
  requireArbitrageFicheTemplates,
  resolveArbitrageFicheTemplateForGeneration,
} from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-fiche-template";
import {
  filterFicheConseilEligibleInvestissements,
  resolveFicheConseilProductKind,
  toFicheConseilContratPickItems,
  type FicheConseilContratPickItem,
} from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-resolve";

export type ArbitrageFicheTemplatePickPending = {
  tache: Tache;
  productKind: ArbitrageFicheProductKind;
  investissementId: number;
  templates: ArbitrageFicheTemplate[];
};

export type ArbitrageFicheContratPickPending = {
  tache: Tache;
  contrats: FicheConseilContratPickItem[];
  suggestedInvestissementId?: number;
};

export function useArbitrageFicheConseil() {
  const [busy, setBusy] = useState(false);
  const [pendingContratPick, setPendingContratPick] =
    useState<ArbitrageFicheContratPickPending | null>(null);
  const [pendingPick, setPendingPick] = useState<ArbitrageFicheTemplatePickPending | null>(null);

  const runGeneration = useCallback(
    async (
      tache: Tache,
      templateId: string,
      productKind: ArbitrageFicheProductKind,
      investissementId: number
    ) => {
      setBusy(true);
      try {
        const { opened } = await generateArbitrageFicheConseil(
          tache,
          templateId,
          productKind,
          investissementId
        );
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

  const continueWithInvestissement = useCallback(
    async (tache: Tache, investissementId: number) => {
      const contactId = tache.contacts[0]?.contact_id;
      if (!contactId) {
        toast.error("Aucun contact lié à cette tâche.");
        return;
      }

      const investissements = await getInvestissementsByContact(contactId);
      const eligible = filterFicheConseilEligibleInvestissements(investissements);
      const investissement = eligible.find((inv) => inv.id === investissementId) ?? null;
      if (!investissement) {
        toast.error("Contrat non éligible ou introuvable pour ce client.");
        return;
      }
      const productKind = resolveFicheConseilProductKind(tache, investissement);
      if (!productKind) {
        toast.error("Type de contrat non pris en charge pour la fiche conseil.");
        return;
      }

      const templates = await requireArbitrageFicheTemplates(productKind);
      const resolved = resolveArbitrageFicheTemplateForGeneration(templates);
      if (resolved) {
        await runGeneration(tache, resolved.id, productKind, investissementId);
        return;
      }
      setPendingPick({ tache, productKind, investissementId, templates });
    },
    [runGeneration]
  );

  const startFicheConseil = useCallback(
    async (tache: Tache) => {
      if (busy || pendingPick || pendingContratPick) return;
      if (!isFicheConseilTask(tache)) return;

      const contactId = tache.contacts[0]?.contact_id;
      if (!contactId) {
        toast.error("Aucun contact lié à cette tâche.");
        return;
      }

      setBusy(true);
      try {
        const contrats = toFicheConseilContratPickItems(
          await getInvestissementsByContact(contactId)
        );
        if (contrats.length === 0) {
          toast.error("Aucun contrat AV/PER éligible pour ce client.");
          return;
        }
        if (contrats.length === 1) {
          await continueWithInvestissement(tache, contrats[0].investissementId);
          return;
        }

        const embeddedId = parseArbitrageInvestissementId(tache.description);
        const suggestedInvestissementId = contrats.some((c) => c.investissementId === embeddedId)
          ? embeddedId ?? undefined
          : undefined;
        setPendingContratPick({ tache, contrats, suggestedInvestissementId });
      } catch (error) {
        console.error(error);
        toast.error(`Erreur : ${String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, pendingPick, pendingContratPick, continueWithInvestissement]
  );

  const confirmContratPick = useCallback(
    (investissementId: number) => {
      const pending = pendingContratPick;
      setPendingContratPick(null);
      if (!pending) return;
      setBusy(true);
      void (async () => {
        try {
          await continueWithInvestissement(pending.tache, investissementId);
        } catch (error) {
          console.error(error);
          toast.error(`Erreur : ${String(error)}`);
        } finally {
          setBusy(false);
        }
      })();
    },
    [pendingContratPick, continueWithInvestissement]
  );

  const confirmTemplatePick = useCallback(
    (templateId: string) => {
      const pending = pendingPick;
      setPendingPick(null);
      if (pending) {
        void runGeneration(
          pending.tache,
          templateId,
          pending.productKind,
          pending.investissementId
        );
      }
    },
    [pendingPick, runGeneration]
  );

  return {
    startFicheConseil,
    pendingContratPick,
    setPendingContratPick,
    confirmContratPick,
    pendingPick,
    setPendingPick,
    confirmTemplatePick,
    busy,
  };
}
