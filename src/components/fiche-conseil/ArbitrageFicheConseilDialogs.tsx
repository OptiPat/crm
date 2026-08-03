import { ArbitrageFicheContratPickDialog } from "@/components/taches/ArbitrageFicheContratPickDialog";
import { ArbitrageFicheTemplatePickDialog } from "@/components/taches/ArbitrageFicheTemplatePickDialog";
import { ArbitrageFicheRedactionDialog } from "@/components/fiche-conseil/ArbitrageFicheRedactionDialog";
import type { FicheConseilHook } from "@/hooks/useArbitrageFicheConseil";

interface ArbitrageFicheConseilDialogsProps {
  hook: FicheConseilHook;
}

export function ArbitrageFicheConseilDialogs({ hook }: ArbitrageFicheConseilDialogsProps) {
  const {
    pendingContratPick,
    setPendingContratPick,
    confirmContratPick,
    pendingPick,
    setPendingPick,
    confirmTemplatePick,
    pendingRedaction,
    setPendingRedaction,
    confirmRedaction,
  } = hook;

  return (
    <>
      <ArbitrageFicheContratPickDialog
        open={pendingContratPick !== null}
        onOpenChange={(open) => {
          if (!open) setPendingContratPick(null);
        }}
        contrats={pendingContratPick?.contrats ?? []}
        suggestedInvestissementId={pendingContratPick?.suggestedInvestissementId}
        onConfirm={confirmContratPick}
      />
      <ArbitrageFicheTemplatePickDialog
        open={pendingPick !== null}
        onOpenChange={(open) => {
          if (!open) setPendingPick(null);
        }}
        templates={pendingPick?.templates ?? []}
        onConfirm={confirmTemplatePick}
      />
      <ArbitrageFicheRedactionDialog
        open={pendingRedaction !== null}
        generationContext={pendingRedaction}
        onOpenChange={(open) => {
          if (!open) setPendingRedaction(null);
        }}
        onConfirm={confirmRedaction}
      />
    </>
  );
}
