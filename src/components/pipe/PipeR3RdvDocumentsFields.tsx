import { PipeR3ChecklistEmailPreviewPanel } from "@/components/pipe/PipeR3ChecklistEmailPreviewPanel";
import type { PipeChecklistTemplates } from "@/lib/pipe/pipe-checklist-template";

interface PipeR3RdvDocumentsFieldsProps {
  templates: PipeChecklistTemplates | null;
  disabled?: boolean;
}

export function PipeR3RdvDocumentsFields({
  templates,
  disabled = false,
}: PipeR3RdvDocumentsFieldsProps) {
  if (!templates) {
    return (
      <p className="text-xs text-muted-foreground rounded-lg border border-border/70 bg-muted/20 p-3">
        Chargement des modèles checklist…
      </p>
    );
  }

  return (
    <div className={disabled ? "opacity-60" : undefined}>
      <div className="space-y-2">
        <p className="text-sm font-medium px-0.5">Documents demandés (mail R3 Placements)</p>
        <PipeR3ChecklistEmailPreviewPanel templates={templates} idPrefix="rdv-r3" />
      </div>
    </div>
  );
}
