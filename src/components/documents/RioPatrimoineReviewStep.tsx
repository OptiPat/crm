import { PatrimoineTriDialog } from "./PatrimoineTriDialog";
import { RioUpdateComparisonDialog } from "./RioUpdateComparisonDialog";
import type { ExtractedData } from "@/lib/pdf";
import type { NewInvestissement } from "@/lib/api/tauri-investissements";

export interface RioPatrimoineReviewStepProps {
  extractedData: ExtractedData;
  contactId: number;
  contactNom: string;
  foyerId?: number;
  coupleMemberIds?: number[];
  hasExistingInvestments: boolean;
  onComplete: (investissements?: NewInvestissement[]) => void;
  onCancel: () => void;
}

/** Écran patrimoine unifié : tri (prospect) ou comparaison (client existant). */
export function RioPatrimoineReviewStep({
  hasExistingInvestments,
  onComplete,
  onCancel,
  ...props
}: RioPatrimoineReviewStepProps) {
  if (hasExistingInvestments) {
    return (
      <RioUpdateComparisonDialog
        embedded
        unifiedTriUx
        open
        onOpenChange={() => {}}
        {...props}
        onComplete={() => onComplete()}
        onCancel={onCancel}
      />
    );
  }

  return (
    <PatrimoineTriDialog
      embedded
      open
      onOpenChange={() => {}}
      {...props}
      ownerLabel={props.contactNom}
      onComplete={(investissements) => onComplete(investissements)}
      onCancel={onCancel}
    />
  );
}
