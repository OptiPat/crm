import type { CompareResponse } from "@/lib/api/tauri-uc-comparator";
import { buildUcTechnicalAnalystNote } from "@/lib/fund-watchlist/uc-comparator-analyst-note";
import { cn } from "@/lib/utils";

type Props = {
  response: CompareResponse;
  className?: string;
};

export function UcComparatorAnalystNote({ response, className }: Props) {
  const note = buildUcTechnicalAnalystNote(response);
  if (!note) return null;

  return (
    <div className={cn("space-y-4 rounded-lg border bg-muted/10 p-4", className)}>
      <div className="space-y-1">
        <h3 className="text-sm font-medium">Note de synthèse technique</h3>
        <p className="text-xs text-muted-foreground">
          Lecture comité d&apos;investissement — générée automatiquement à partir des scores et de
          l&apos;exposition Boursorama. À valider par le conseiller avant tout arbitrage client.
        </p>
      </div>
      {note.sections.map((section) => (
        <div key={section.title} className="space-y-2">
          <h4 className="text-sm font-medium">{section.title}</h4>
          {section.paragraphs.map((paragraph, index) => (
            <p key={index} className="text-sm leading-relaxed text-foreground/90">
              {paragraph}
            </p>
          ))}
        </div>
      ))}
    </div>
  );
}
