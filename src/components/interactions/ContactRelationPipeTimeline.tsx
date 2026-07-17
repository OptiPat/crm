import { Calendar, ExternalLink, FileText, Phone, Send } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { PipeContactTimelineEntry } from "@/lib/api/tauri-pipe-contact-timeline";
import {
  groupContactPipeTimelineByYearMonth,
  pipeRelationEntryLabel,
  pipeRelationTypeLabel,
} from "@/lib/interactions/contact-relation-pipe-timeline";
import {
  getPipeTimelineEntryStyle,
  isStageMilestoneEntry,
} from "@/lib/pipe/pipe-timeline-display";
import { formatTimelineOccurredAt } from "@/lib/pipe/pipe-timeline-types";
import { cn } from "@/lib/utils";

const TYPE_ICONS = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  PROPOSITION: Send,
} as const;

function PipeTimelineEntryCard({
  entry,
  isLast,
  onOpenPipe,
}: {
  entry: PipeContactTimelineEntry;
  isLast: boolean;
  onOpenPipe?: (pipeId: number) => void;
}) {
  const labels = pipeRelationEntryLabel(entry);
  const archived = entry.pipe_archived_at != null && entry.pipe_archived_at > 0;
  const context = { pipeType: entry.pipe_type, timelineEntries: [] };
  const style = getPipeTimelineEntryStyle(entry, context);
  const milestone = isStageMilestoneEntry(entry.entry_type);
  const userType = entry.entry_type;
  const Icon =
    !milestone && userType in TYPE_ICONS
      ? TYPE_ICONS[userType as keyof typeof TYPE_ICONS]
      : null;

  return (
    <li className={cn("relative pl-6", !isLast && "pb-6")}>
      {!isLast && (
        <span className="absolute left-[0.4375rem] top-3 bottom-0 w-px bg-border" aria-hidden />
      )}
      <span
        className={cn(
          "absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-background",
          style.dot
        )}
        aria-hidden
      />

      <article className={cn("rounded-lg border p-3 shadow-sm", style.card)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("font-normal gap-1 border", style.badge)}>
                {Icon && <Icon className="h-3 w-3" />}
                {labels.badge}
              </Badge>
              <Badge variant="outline" className="text-[10px] h-5 px-1.5 font-normal">
                {pipeRelationTypeLabel(entry.pipe_type)}
              </Badge>
              {archived && (
                <Badge variant="secondary" className="text-[10px] h-5 px-1.5">
                  Archivé
                </Badge>
              )}
              <time className="text-xs text-muted-foreground tabular-nums">
                {formatTimelineOccurredAt(entry.occurred_at)}
              </time>
            </div>

            <p className="text-sm font-semibold leading-snug text-foreground/90">
              {entry.pipe_titre}
            </p>

            {labels.title && (
              <p className="text-sm font-medium leading-snug">{labels.title}</p>
            )}

            {labels.subtitle && (
              <p className="text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
                {labels.subtitle}
              </p>
            )}
          </div>
        </div>

        {onOpenPipe && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mt-2 h-7 gap-1 px-2 text-xs"
            onClick={() => onOpenPipe(entry.pipe_id)}
          >
            <ExternalLink className="h-3 w-3" />
            Ouvrir le pipe
          </Button>
        )}
      </article>
    </li>
  );
}

interface ContactRelationPipeTimelineProps {
  entries: PipeContactTimelineEntry[];
  onOpenPipe?: (pipeId: number) => void;
}

export function ContactRelationPipeTimeline({
  entries,
  onOpenPipe,
}: ContactRelationPipeTimelineProps) {
  const grouped = groupContactPipeTimelineByYearMonth(entries);

  return (
    <div className="space-y-8">
      {grouped.map((yearGroup) => (
        <section key={yearGroup.year} className="space-y-5">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            {yearGroup.year}
          </h3>
          {yearGroup.months.map((monthGroup) => (
            <div key={monthGroup.key} className="space-y-3">
              <h4 className="text-sm font-medium text-foreground/90">{monthGroup.label}</h4>
              <ol className="m-0 list-none p-0">
                {monthGroup.items.map((entry, index) => (
                  <PipeTimelineEntryCard
                    key={entry.id}
                    entry={entry}
                    isLast={index === monthGroup.items.length - 1}
                    onOpenPipe={onOpenPipe}
                  />
                ))}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}
