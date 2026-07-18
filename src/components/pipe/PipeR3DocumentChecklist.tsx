import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Document } from "@/lib/api/tauri-documents";
import { PipeChecklistDocumentLink } from "@/components/pipe/PipeChecklistDocumentLink";
import type {
  PipeR3ChecklistItemState,
  PipeR3ChecklistItems,
  PipeR3DocumentChecklist,
  UpdatePipeR3DocumentChecklistInput,
} from "@/lib/api/tauri-pipe-r3-checklist";
import type { PipeChecklistTemplateItem, PipeChecklistTemplates } from "@/lib/pipe/pipe-checklist-template";
import {
  countR3ChecklistProgress,
  getActiveR3ChecklistItems,
  getChecklistItemState,
  isR3ChecklistItemComplete,
  isR3ChecklistPastStage,
} from "@/lib/pipe/r3-document-checklist";
import { suggestedDocumentTypeForChecklistItem } from "@/lib/pipe/pipe-checklist-document-import";
import { cn } from "@/lib/utils";

interface PipeR3DocumentChecklistProps {
  pipeId: number;
  stage: string;
  contactId: number;
  checklist: PipeR3DocumentChecklist | null;
  documents: Document[];
  loading: boolean;
  templates: PipeChecklistTemplates | null;
  onPersist: (update: UpdatePipeR3DocumentChecklistInput) => Promise<boolean>;
  onDocumentImported?: (doc: Document) => void;
  linkItemDocument: (itemId: string, documentId: number | null) => Promise<void>;
}

function R3ChecklistItemRow({
  def,
  item,
  contactId,
  documents,
  showDocumentLink,
  onToggleReceived,
  onLinkDocument,
  onExpandLink,
  onDocumentImported,
}: {
  def: PipeChecklistTemplateItem;
  item: PipeR3ChecklistItemState;
  contactId: number;
  documents: Document[];
  showDocumentLink: boolean;
  onToggleReceived: (received: boolean) => void;
  onLinkDocument: (documentId: number | null) => void | Promise<void>;
  onExpandLink: () => void;
  onDocumentImported?: (doc: Document) => void;
}) {
  const complete = isR3ChecklistItemComplete(item);

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-background/80 px-3 py-2.5 space-y-2",
        complete && "bg-emerald-50/40 dark:bg-emerald-950/15"
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          id={`r3-item-${def.id}`}
          checked={item.received}
          onCheckedChange={(checked) => onToggleReceived(checked === true)}
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
            <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{def.hint}</p>
          ) : null}
        </div>
      </div>

      <PipeChecklistDocumentLink
        contactId={contactId}
        documentId={item.document_id ?? null}
        documents={documents}
        expanded={showDocumentLink}
        onExpand={onExpandLink}
        onLink={onLinkDocument}
        onDocumentImported={onDocumentImported}
        suggestedTypeDocument={suggestedDocumentTypeForChecklistItem(def.id)}
      />
    </li>
  );
}

export function PipeR3DocumentChecklist({
  pipeId,
  stage,
  contactId,
  checklist,
  documents,
  loading,
  templates,
  onPersist,
  onDocumentImported,
  linkItemDocument,
}: PipeR3DocumentChecklistProps) {
  const [collapsed, setCollapsed] = useState(isR3ChecklistPastStage(stage));
  const [missingOnly, setMissingOnly] = useState(false);
  const [linkExpandedIds, setLinkExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsed(isR3ChecklistPastStage(stage));
    setMissingOnly(false);
    setLinkExpandedIds(new Set());
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

  const activeItems = useMemo(
    () => (templates ? getActiveR3ChecklistItems(templates) : []),
    [templates]
  );

  const filteredItems = useMemo(() => {
    if (!checklist || !missingOnly) return activeItems;
    return activeItems.filter(
      (def) => !isR3ChecklistItemComplete(getChecklistItemState(checklist.items, def.id))
    );
  }, [activeItems, checklist, missingOnly]);

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
  const missingCount = progress.total - progress.received;

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
          {activeItems.length > 0 ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="r3-missing-only"
                checked={missingOnly}
                onCheckedChange={(v) => setMissingOnly(v === true)}
              />
              <Label htmlFor="r3-missing-only" className="text-sm font-normal cursor-pointer">
                Afficher seulement les manquantes
                {missingCount > 0 ? (
                  <span className="text-muted-foreground"> ({missingCount})</span>
                ) : null}
              </Label>
            </div>
          ) : null}

          {filteredItems.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {missingOnly && activeItems.length > 0
                ? "Toutes les pièces actives sont reçues."
                : "Aucune pièce configurée — utilisez Paramètres à côté des boutons Affaire / Suivi / Action."}
            </p>
          ) : (
            <ul className="space-y-3">
              {filteredItems.map((def) => {
                const item = getChecklistItemState(checklist.items, def.id);
                const showDocumentLink =
                  item.received || item.document_id != null || linkExpandedIds.has(def.id);

                return (
                  <R3ChecklistItemRow
                    key={def.id}
                    def={def}
                    item={item}
                    contactId={contactId}
                    documents={documents}
                    showDocumentLink={showDocumentLink}
                    onToggleReceived={(received) => {
                      if (received) {
                        setLinkExpandedIds((prev) => new Set(prev).add(def.id));
                      }
                      updateItem(def.id, { received });
                    }}
                    onLinkDocument={(documentId) => linkItemDocument(def.id, documentId)}
                    onExpandLink={() => {
                      setLinkExpandedIds((prev) => new Set(prev).add(def.id));
                    }}
                    onDocumentImported={onDocumentImported}
                  />
                );
              })}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
