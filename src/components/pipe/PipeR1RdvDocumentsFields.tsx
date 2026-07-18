import { PipeR1ChecklistEmailPreviewPanel } from "@/components/pipe/PipeR1ChecklistEmailPreviewPanel";
import type { PipeChecklistTemplates, R1ChecklistProfile } from "@/lib/pipe/pipe-checklist-template";

interface PipeR1RdvDocumentsFieldsProps {
  profile: R1ChecklistProfile;
  templates: PipeChecklistTemplates | null;
  onProfileChange: (profile: R1ChecklistProfile) => void;
  disabled?: boolean;
}

export function PipeR1RdvDocumentsFields({
  profile,
  templates,
  onProfileChange,
  disabled = false,
}: PipeR1RdvDocumentsFieldsProps) {
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
        <p className="text-sm font-medium px-0.5">Documents demandés (mail R1)</p>
        <PipeR1ChecklistEmailPreviewPanel
          templates={templates}
          profile={profile}
          onProfileChange={onProfileChange}
          idPrefix="rdv-r1"
          disabled={disabled}
        />
      </div>
    </div>
  );
}
