import type { KeyboardEvent, MouseEvent } from "react";
import { FileWarning } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import type { PipeR3ImmoDocumentChecklist } from "@/lib/api/tauri-pipe-r3-immo-checklist";
import {
  listMissingR3ImmoChecklistLabels,
  type R3ImmoChecklistContext,
} from "@/lib/pipe/r3-immo-document-checklist";
import type { R3ImmoChecklistTemplate } from "@/lib/pipe/r3-immo-checklist-template";
import { cn } from "@/lib/utils";

export function PipeR3ImmoMissingDocsBadge({
  checklist,
  checklistContext,
  checklistTemplate,
  missingLabels,
  className,
  onClick,
}: {
  checklist?: PipeR3ImmoDocumentChecklist | null;
  checklistContext?: R3ImmoChecklistContext | null;
  checklistTemplate?: R3ImmoChecklistTemplate | null;
  missingLabels?: string[];
  className?: string;
  onClick?: (event: MouseEvent) => void;
}) {
  const missing =
    missingLabels ??
    (checklist && checklistContext
      ? listMissingR3ImmoChecklistLabels(
          checklist,
          checklistContext,
          checklistTemplate ?? undefined
        )
      : []);
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
            className="text-xs border-amber-300/80 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100 dark:hover:bg-amber-950/60 gap-1 max-w-full"
          >
            <FileWarning className="h-3 w-3 shrink-0" />
            <span className="truncate">
              R3 Immo · {missing.length} pièce{missing.length > 1 ? "s" : ""} manquante
              {missing.length > 1 ? "s" : ""}
            </span>
          </Badge>
        </span>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-80 p-3">
        <p className="text-xs font-medium text-foreground mb-2">Documents R3 immo à collecter</p>
        <ul className="space-y-1.5 text-xs text-muted-foreground">
          {missing.map((label) => (
            <li key={label} className="flex gap-2 leading-snug">
              <span className="text-amber-600 dark:text-amber-400 shrink-0">•</span>
              <span>{label}</span>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}
