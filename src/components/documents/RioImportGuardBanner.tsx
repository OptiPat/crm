import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import type { RioImportAssessment } from "@/lib/documents/rio-import-guard";
import { missingFieldToTab, type RioPreviewTab } from "@/lib/documents/rio-preview-tab-status";

interface RioImportGuardBannerProps {
  assessment: RioImportAssessment | null;
  className?: string;
  /** Clic sur un champ manquant → navigation vers l'onglet correspondant. */
  onNavigateToTab?: (tab: RioPreviewTab) => void;
}

function MissingFieldChip({
  field,
  onNavigate,
}: {
  field: string;
  onNavigate?: (tab: RioPreviewTab) => void;
}) {
  const tab = missingFieldToTab(field);
  if (tab && onNavigate) {
    return (
      <button
        type="button"
        className="underline underline-offset-2 hover:text-foreground font-medium"
        onClick={() => onNavigate(tab)}
      >
        {field}
      </button>
    );
  }
  return <span>{field}</span>;
}

export function RioImportGuardBanner({
  assessment,
  className,
  onNavigateToTab,
}: RioImportGuardBannerProps) {
  if (!assessment) return null;

  const hasIssues = assessment.issues.length > 0;
  const hasWarnings = assessment.warnings.length > 0;

  if (!hasIssues && !hasWarnings && assessment.formatLabel) {
    return (
      <div
        className={`flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900 ${className ?? ""}`}
      >
        <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" aria-hidden />
        <div>
          <p className="font-medium">Document détecté : {assessment.formatLabel}</p>
          {assessment.missingConfidenceFields.length > 0 && (
            <p className="text-xs mt-0.5 text-green-800">
              Champs non détectés :{" "}
              {assessment.missingConfidenceFields.map((field, index) => (
                <span key={field}>
                  {index > 0 ? ", " : ""}
                  <MissingFieldChip field={field} onNavigate={onNavigateToTab} />
                </span>
              ))}
            </p>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`space-y-2 ${className ?? ""}`}>
      {!hasIssues && (
        <div className="flex items-start gap-2 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-900">
          <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5 text-green-600" aria-hidden />
          <p className="font-medium">Document détecté : {assessment.formatLabel}</p>
        </div>
      )}

      {hasIssues && (
        <div className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive">
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" aria-hidden />
          <ul className="list-disc pl-4 space-y-1">
            {assessment.issues.map((issue) => (
              <li key={issue}>{issue}</li>
            ))}
          </ul>
        </div>
      )}

      {hasWarnings && (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" aria-hidden />
          <ul className="list-disc pl-4 space-y-1">
            {assessment.warnings.map((warning) => (
              <li key={warning}>{warning}</li>
            ))}
          </ul>
        </div>
      )}

      {assessment.missingConfidenceFields.length > 0 && (hasIssues || hasWarnings) && (
        <p className="text-xs text-muted-foreground px-1">
          Champs à vérifier :{" "}
          {assessment.missingConfidenceFields.map((field, index) => (
            <span key={field}>
              {index > 0 ? ", " : ""}
              <MissingFieldChip field={field} onNavigate={onNavigateToTab} />
            </span>
          ))}
        </p>
      )}
    </div>
  );
}
