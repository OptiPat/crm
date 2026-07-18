import { useMemo } from "react";
import { R1ChecklistEmailHtmlPreview } from "@/components/pipe/R1ChecklistEmailHtmlPreview";
import { buildR3ImmoChecklistEmailVariablesFromTemplate } from "@/lib/pipe/pipe-r3-immo-checklist-email-vars";
import type { R3ImmoChecklistTemplate } from "@/lib/pipe/r3-immo-checklist-template";

interface PipeR3ImmoChecklistEmailPreviewPanelProps {
  template: R3ImmoChecklistTemplate;
  idPrefix?: string;
}

export function PipeR3ImmoChecklistEmailPreviewPanel({
  template,
  idPrefix = "r3-immo-email-preview",
}: PipeR3ImmoChecklistEmailPreviewPanelProps) {
  const previewHtml = useMemo(
    () => buildR3ImmoChecklistEmailVariablesFromTemplate(template).liste_documents_r3_immo_html,
    [template]
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
          <span className="font-mono">{"{{liste_documents_r3_immo_html}}"}</span> pour les RDV R3
          Immo. À l&apos;envoi, seules les pièces applicables au dossier sont listées.
        </p>
      </div>

      {previewHtml ? (
        <div className="rounded-md border border-border/50 bg-background/80 px-3 py-2 space-y-2">
          <p className="text-[11px] font-medium text-muted-foreground">Liste HTML</p>
          <R1ChecklistEmailHtmlPreview html={previewHtml} />
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Aucune pièce configurée.</p>
      )}
    </div>
  );
}
