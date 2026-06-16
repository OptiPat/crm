import { FileText, User } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import { RioImportStepper } from "./RioImportStepper";
import type { RioImportStep } from "@/lib/documents/rio-import-preview";

interface RioWizardContextBarProps {
  step: RioImportStep;
  clientLabel: string;
  fileName?: string;
  detectedType?: string;
  showPatrimoineStep?: boolean;
}

export function RioWizardContextBar({
  step,
  clientLabel,
  fileName,
  detectedType,
  showPatrimoineStep = true,
}: RioWizardContextBarProps) {
  const typeLabel = detectedType
    ? getDocumentTypeLabel(detectedType === "RIO" ? "PATRIMOINE" : detectedType === "QPI" ? "QPI" : detectedType)
    : null;

  return (
    <div className="space-y-3 border-b pb-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1 min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <User className="h-4 w-4 text-primary shrink-0" aria-hidden />
            <span className="font-semibold truncate">{clientLabel || "Client non sélectionné"}</span>
            {typeLabel && (
              <Badge variant="secondary" className="text-xs">
                {typeLabel}
              </Badge>
            )}
          </div>
          {fileName && (
            <div className="flex items-center gap-1.5 text-sm text-muted-foreground truncate">
              <FileText className="h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="truncate">{fileName}</span>
            </div>
          )}
        </div>
      </div>
      <RioImportStepper currentStep={step} showPatrimoineStep={showPatrimoineStep} />
    </div>
  );
}
