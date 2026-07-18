import type { KeyboardEvent, MouseEvent } from "react";
import { FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PipeR3DocumentChecklist } from "@/lib/api/tauri-pipe-r3-checklist";
import type { PipeChecklistTemplates } from "@/lib/pipe/pipe-checklist-template";
import { listMissingR3ChecklistLabels } from "@/lib/pipe/r3-document-checklist";
import { cn } from "@/lib/utils";

export function PipeR3MissingDocsBadge({
  checklist,
  missingLabels,
  templates,
  className,
  onClick,
}: {
  checklist?: PipeR3DocumentChecklist | null;
  missingLabels?: string[];
  templates?: PipeChecklistTemplates | null;
  className?: string;
  onClick?: (event: MouseEvent) => void;
}) {
  const missing =
    missingLabels ??
    (checklist && templates ? listMissingR3ChecklistLabels(checklist, templates) : []);
  if (missing.length === 0) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <span
          role="button"
          tabIndex={0}
          className={cn("inline-flex max-w-full cursor-pointer", className)}
          onClick={onClick}
          onPointerDown={onClick}
          onKeyDown={(event: KeyboardEvent) => {
            if (event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              onClick?.(event as unknown as MouseEvent);
            }
          }}
        >
          <Badge
            variant="outline"
            className="text-xs border-[#dd216e]/45 bg-[#dd216e]/10 text-[#b01855] hover:bg-[#dd216e]/15 dark:border-[#dd216e]/55 dark:bg-[#dd216e]/20 dark:text-[#f7aac8] dark:hover:bg-[#dd216e]/25 gap-1 max-w-full"
          >
            <FileWarning className="h-3 w-3 shrink-0" />
            <span className="truncate">
              R3 Placements · {missing.length} pièce{missing.length > 1 ? "s" : ""} manquante
              {missing.length > 1 ? "s" : ""}
            </span>
          </Badge>
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="text-xs font-medium text-foreground mb-2">Documents R3 Placements à collecter</p>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {missing.map((label) => (
            <li key={label} className="flex gap-2 leading-snug">
              <span className="text-[#dd216e] dark:text-[#f07aaa] shrink-0">•</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
