import { useCallback, useState } from "react";
import { toast } from "sonner";
import type { Tache } from "@/lib/api/tauri-taches";
import type { ArbitrageFicheTemplate, FicheConseilTemplateFamily } from "@/lib/api/tauri-arbitrage-fiche";
import { getInvestissementsByContact } from "@/lib/api/tauri-investissements";
import { buildPartenaireNomMap } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-partenaires";
import {
  isFicheConseilTask,
  parseArbitrageInvestissementId,
  resolveArbitrageFicheProductKind,
  type ArbitrageFicheProductKind,
} from "@/lib/alertes/arbitrage-alerte";
import { generateArbitrageFicheConseil } from "@/lib/pdf/arbitrage-fiche-conseil/generate-arbitrage-fiche";
import {
  requireArbitrageFicheTemplates,
  resolveArbitrageFicheTemplateForGeneration,
} from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-fiche-template";
import type { VpModificationPdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
import {
  filterFicheConseilEligibleInvestissements,
  filterFicheConseilContratPickItemsByProductKind,
  filterFicheConseilContratPickItemsByStelliumProduct,
  resolveFicheConseilProductKind,
  toFicheConseilContratPickItems,
  type FicheConseilContratPickItem,
  type FicheConseilContext,
} from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-resolve";
import {
  isStelliumActEligibleForFicheConseil,
  resolveFicheConseilTemplateFamily,
  stelliumProductLabelToFicheProductKind,
} from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-stellium";

export type FicheConseilHook = ReturnType<typeof useArbitrageFicheConseil>;

export function isFicheConseilActionsBusy(
  hook: Pick<FicheConseilHook, "busy" | "pendingPick" | "pendingContratPick">,
  sendToPipeBusyId?: number | null
): boolean {
  return (
    hook.busy ||
    hook.pendingPick != null ||
    hook.pendingContratPick != null ||
    sendToPipeBusyId != null
  );
}

export type FicheConseilStartOptions = {
  suggestedInvestissementId?: number;
  filterProductKind?: ArbitrageFicheProductKind;
  /** Libellé catalogue Stellium (depuis acte pipe) — affine au-delà du type AV/PER. */
  stelliumProductLabel?: string;
  templateFamily?: FicheConseilTemplateFamily;
  /** Détails modification VP (types cochés + valeurs saisies). */
  vpModification?: VpModificationPdfFillInput;
};

export type ArbitrageFicheTemplatePickPending = {
  context: FicheConseilContext;
  productKind: ArbitrageFicheProductKind;
  investissementId: number;
  templates: ArbitrageFicheTemplate[];
  templateFamily: FicheConseilTemplateFamily;
};

export type ArbitrageFicheContratPickPending = {
  context: FicheConseilContext;
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
      contactId: number,
      templateId: string,
      productKind: ArbitrageFicheProductKind,
      investissementId: number,
      templateFamily: FicheConseilTemplateFamily = "ARBITRAGE",
      vpModification?: VpModificationPdfFillInput
    ) => {
      setBusy(true);
      try {
        const { opened } = await generateArbitrageFicheConseil(
          contactId,
          templateId,
          productKind,
          investissementId,
          templateFamily,
          { vpModification }
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
    async (context: FicheConseilContext, investissementId: number) => {
      const contactId = context.contactId;
      if (!contactId) {
        toast.error("Aucun contact lié.");
        return;
      }

      const investissements = await getInvestissementsByContact(contactId);
      const eligible = filterFicheConseilEligibleInvestissements(investissements);
      const investissement = eligible.find((inv) => inv.id === investissementId) ?? null;
      if (!investissement) {
        toast.error("Contrat non éligible ou introuvable pour ce client.");
        return;
      }
      const productKind = resolveFicheConseilProductKind(
        { titre: context.titreHint ?? "" },
        investissement
      );
      if (!productKind) {
        toast.error("Type de contrat non pris en charge pour la fiche conseil.");
        return;
      }

      const templateFamily = context.templateFamily ?? "ARBITRAGE";
      const templates = await requireArbitrageFicheTemplates(productKind, templateFamily);
      const resolved = resolveArbitrageFicheTemplateForGeneration(templates);
      if (resolved) {
        await runGeneration(
          contactId,
          resolved.id,
          productKind,
          investissementId,
          templateFamily,
          context.vpModification
        );
        return;
      }
      setPendingPick({
        context,
        productKind,
        investissementId,
        templates,
        templateFamily,
      });
    },
    [runGeneration]
  );

  const startFicheConseil = useCallback(
    async (context: FicheConseilContext, options?: FicheConseilStartOptions) => {
      if (busy || pendingPick || pendingContratPick) {
        toast.info("Génération fiche conseil en cours…");
        return;
      }
      if (!context.contactId) {
        toast.error("Aucun contact lié.");
        return;
      }

      setBusy(true);
      try {
        const investissements = await getInvestissementsByContact(context.contactId);
        let contrats = toFicheConseilContratPickItems(investissements);
        if (options?.filterProductKind) {
          contrats = filterFicheConseilContratPickItemsByProductKind(
            contrats,
            options.filterProductKind
          );
        }
        if (options?.stelliumProductLabel?.trim()) {
          const partenaireNoms = await buildPartenaireNomMap(investissements);
          contrats = filterFicheConseilContratPickItemsByStelliumProduct(
            contrats,
            investissements,
            partenaireNoms,
            options.stelliumProductLabel
          );
        }
        if (contrats.length === 0) {
          toast.error("Aucun contrat AV/PER éligible pour ce client.");
          return;
        }

        const embeddedId =
          options?.suggestedInvestissementId ??
          parseArbitrageInvestissementId(context.descriptionHint);
        const contextWithFamily: FicheConseilContext = {
          ...context,
          templateFamily: options?.templateFamily ?? context.templateFamily ?? "ARBITRAGE",
          vpModification: options?.vpModification ?? context.vpModification,
        };
        if (embeddedId && contrats.some((c) => c.investissementId === embeddedId)) {
          await continueWithInvestissement(contextWithFamily, embeddedId);
          return;
        }

        if (contrats.length === 1) {
          await continueWithInvestissement(contextWithFamily, contrats[0].investissementId);
          return;
        }

        const suggestedInvestissementId = contrats.some((c) => c.investissementId === embeddedId)
          ? embeddedId ?? undefined
          : undefined;
        setPendingContratPick({
          context: contextWithFamily,
          contrats,
          suggestedInvestissementId,
        });
      } catch (error) {
        console.error(error);
        toast.error(`Erreur : ${String(error)}`);
      } finally {
        setBusy(false);
      }
    },
    [busy, pendingPick, pendingContratPick, continueWithInvestissement]
  );

  const startFicheConseilForTask = useCallback(
    (tache: Tache) => {
      if (!isFicheConseilTask(tache)) return;
      const contactId = tache.contacts[0]?.contact_id;
      if (!contactId) {
        toast.error("Aucun contact lié à cette tâche.");
        return;
      }
      const embeddedId = parseArbitrageInvestissementId(tache.description);
      const kindFromTitle: ArbitrageFicheProductKind | null = resolveArbitrageFicheProductKind(tache);
      void startFicheConseil(
        {
          contactId,
          titreHint: tache.titre,
          descriptionHint: tache.description,
        },
        {
          suggestedInvestissementId: embeddedId ?? undefined,
          filterProductKind: kindFromTitle ?? undefined,
        }
      );
    },
    [startFicheConseil]
  );

  const startFicheConseilForStelliumAct = useCallback(
    (
      contactId: number,
      stelliumLabel: string,
      productLabel: string,
      options?: { suggestedInvestissementId?: number; vpModification?: VpModificationPdfFillInput }
    ) => {
      if (!isStelliumActEligibleForFicheConseil(stelliumLabel, productLabel)) return;
      const filterProductKind = stelliumProductLabelToFicheProductKind(productLabel);
      void startFicheConseil(
        { contactId },
        {
          filterProductKind: filterProductKind ?? undefined,
          // PER : comme l'arbitrage auto (filtre type seulement, pas le libellé catalogue).
          stelliumProductLabel:
            filterProductKind === "PER" ? undefined : productLabel.trim() || undefined,
          suggestedInvestissementId: options?.suggestedInvestissementId,
          templateFamily: resolveFicheConseilTemplateFamily(stelliumLabel),
          vpModification: options?.vpModification,
        }
      );
    },
    [startFicheConseil]
  );

  const confirmContratPick = useCallback(
    (investissementId: number) => {
      const pending = pendingContratPick;
      setPendingContratPick(null);
      if (!pending) return;
      setBusy(true);
      void (async () => {
        try {
          await continueWithInvestissement(pending.context, investissementId);
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
          pending.context.contactId,
          templateId,
          pending.productKind,
          pending.investissementId,
          pending.templateFamily,
          pending.context.vpModification
        );
      }
    },
    [pendingPick, runGeneration]
  );

  return {
    startFicheConseil,
    startFicheConseilForTask,
    startFicheConseilForStelliumAct,
    pendingContratPick,
    setPendingContratPick,
    confirmContratPick,
    pendingPick,
    setPendingPick,
    confirmTemplatePick,
    busy,
  };
}
