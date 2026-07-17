import { useEffect, useState } from "react";
import { ChevronDown, FileText, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Document } from "@/lib/api/tauri-documents";
import type {
  PipeR3ChecklistItemState,
  PipeR3ChecklistItems,
  PipeR3DocumentChecklist,
  UpdatePipeR3DocumentChecklistInput,
} from "@/lib/api/tauri-pipe-r3-checklist";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import type { PipeChecklistTemplates } from "@/lib/pipe/pipe-checklist-template";
import {
  countR3ChecklistProgress,
  getActiveR3ChecklistItems,
  getChecklistItemState,
  isR3ChecklistItemComplete,
  isR3ChecklistPastStage,
} from "@/lib/pipe/r3-document-checklist";
import { cn } from "@/lib/utils";

interface PipeR3DocumentChecklistProps {
  pipeId: number;
  stage: string;
  checklist: PipeR3DocumentChecklist | null;
  documents: Document[];
  loading: boolean;
  templates: PipeChecklistTemplates | null;
  onPersist: (update: UpdatePipeR3DocumentChecklistInput) => Promise<void>;
}

const NONE_DOC_VALUE = "__none__";

export function PipeR3DocumentChecklist({
  pipeId,
  stage,
  checklist,
  documents,
  loading,
  templates,
  onPersist,
}: PipeR3DocumentChecklistProps) {
  const [collapsed, setCollapsed] = useState(isR3ChecklistPastStage(stage));

  useEffect(() => {
    setCollapsed(isR3ChecklistPastStage(stage));
  }, [pipeId, stage]);

  const updateItem = (itemId: string, patch: Partial<PipeR3ChecklistItemState>) => {
    if (!checklist) return;
    const current = getChecklistItemState(checklist.items, itemId);
    const items: PipeR3ChecklistItems = {
      ...checklist.items,
      [itemId]: { ...current, ...patch },
    };
    void onPersist({ items });
  };

  if (loading && !checklist) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Documents R3 — chargement…
      </div>
    );
  }

  if (!checklist || !templates) return null;

  const progress = countR3ChecklistProgress(checklist, templates);
  const itemDefinitions = getActiveR3ChecklistItems(templates);

  return (
    <div className="rounded-xl border bg-muted/20 overflow-hidden">
      <div
        className={cn(
          "sticky top-0 z-10 bg-muted/95 backdrop-blur-sm border-border/40 px-4 py-3",
          !collapsed && "border-b"
        )}
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <button
            type="button"
            className="flex items-start gap-2 text-left min-w-0"
            onClick={() => setCollapsed((v) => !v)}
          >
            <ChevronDown
              className={cn(
                "h-4 w-4 shrink-0 mt-0.5 text-muted-foreground transition-transform",
                collapsed && "-rotate-90"
              )}
            />
            <div>
              <p className="text-sm font-medium">Documents R3 — Placements</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pièces pour la souscription — {progress.received} / {progress.total} reçu
                {progress.total > 1 ? "s" : ""}
              </p>
            </div>
          </button>
          {progress.total > 0 ? (
            <Badge
              variant={progress.received === progress.total ? "secondary" : "outline"}
              className="tabular-nums shrink-0"
            >
              {progress.received}/{progress.total}
            </Badge>
          ) : null}
        </div>
      </div>

      {!collapsed && (
        <div className="px-4 py-3 space-y-4">
          {itemDefinitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune pièce configurée — utilisez Paramètres à côté des boutons Affaire / Suivi /
              Action.
            </p>
          ) : (
            <ul className="space-y-3">
              {itemDefinitions.map((def) => {
                const item = getChecklistItemState(checklist.items, def.id);
                const complete = isR3ChecklistItemComplete(item);
                const linkedDoc =
                  item.document_id != null
                    ? documents.find((doc) => doc.id === item.document_id)
                    : undefined;

                return (
                  <li
                    key={def.id}
                    className={cn(
                      "rounded-lg border border-border bg-background/80 px-3 py-2.5 space-y-2",
                      complete && "bg-emerald-50/40 dark:bg-emerald-950/15"
                    )}
                  >
                    <div className="flex items-start gap-2">
                      <Checkbox
                        id={`r3-item-${def.id}`}
                        checked={item.received}
                        onCheckedChange={(checked) => {
                          updateItem(def.id, { received: checked === true });
                        }}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <Label
                          htmlFor={`r3-item-${def.id}`}
                          className="text-sm font-normal leading-snug cursor-pointer"
                        >
                          {def.label}
                        </Label>
                        {def.hint ? (
                          <p className="text-xs text-muted-foreground mt-0.5">{def.hint}</p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 pl-6">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <Select
                        value={
                          item.document_id != null ? String(item.document_id) : NONE_DOC_VALUE
                        }
                        onValueChange={(value) => {
                          updateItem(def.id, {
                            document_id: value === NONE_DOC_VALUE ? null : Number(value),
                          });
                        }}
                      >
                        <SelectTrigger className="h-8 max-w-full flex-1 text-xs">
                          <SelectValue placeholder="Lier un document" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE_DOC_VALUE}>Aucun document lié</SelectItem>
                          {documents.map((doc) => (
                            <SelectItem key={doc.id} value={String(doc.id)}>
                              {doc.nom_fichier} — {getDocumentTypeLabel(doc.type_document)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      {linkedDoc ? (
                        <span className="text-[11px] text-muted-foreground truncate max-w-[12rem]">
                          {getDocumentTypeLabel(linkedDoc.type_document)}
                        </span>
                      ) : null}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
