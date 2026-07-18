import { useMemo } from "react";
import { R1ChecklistEmailHtmlPreview } from "@/components/pipe/R1ChecklistEmailHtmlPreview";
import { buildR3ChecklistEmailVariablesFromTemplates } from "@/lib/pipe/pipe-r3-checklist-email-vars";
import type { PipeChecklistTemplates } from "@/lib/pipe/pipe-checklist-template";

interface PipeR3ChecklistEmailPreviewPanelProps {
  templates: PipeChecklistTemplates;
  idPrefix?: string;
}

export function PipeR3ChecklistEmailPreviewPanel({
  templates,
  idPrefix = "r3-email-preview",
}: PipeR3ChecklistEmailPreviewPanelProps) {
  const previewHtml = useMemo(
    () => buildR3ChecklistEmailVariablesFromTemplates(templates).liste_documents_r3_html,
    [templates]
  );

  return (
    <div
      id={idPrefix}
      className="rounded-lg border border-border/70 bg-muted/20 p-3 space-y-3"
    >
      <div className="space-y-1">
        <p className="text-sm font-medium">Aperçu variable email</p>
        <p className="text-xs text-muted-foreground leading-snug">
          Rendu de{" "}
          <span className="font-mono">{"{{liste_documents_r3_html}}"}</span> pour les RDV R3
          Placements (DER, RIO, QPI, identité, domicile, RIB).
        </p>
      </div>

      {previewHtml ? (
        <div className="rounded-md border border-border/50 bg-background/80 px-3 py-2 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Liste HTML</p>
          <R1ChecklistEmailHtmlPreview html={previewHtml} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune pièce active.</p>
      )}
    </div>
  );
}
