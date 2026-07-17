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
  PipeR1ChecklistItemState,
  PipeR1ChecklistItems,
  PipeR1DocumentChecklist,
  UpdatePipeR1DocumentChecklistInput,
} from "@/lib/api/tauri-pipe-r1-checklist";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import type { PipeChecklistTemplates } from "@/lib/pipe/pipe-checklist-template";
import {
  countR1ChecklistProgress,
  getActiveR1ChecklistItems,
  getChecklistItemState,
  isR1ChecklistItemComplete,
  isR1ChecklistPastStage,
} from "@/lib/pipe/r1-document-checklist";
import { cn } from "@/lib/utils";

interface PipeR1DocumentChecklistProps {
  pipeId: number;
  stage: string;
  checklist: PipeR1DocumentChecklist | null;
  documents: Document[];
  loading: boolean;
  templates: PipeChecklistTemplates | null;
  onPersist: (update: UpdatePipeR1DocumentChecklistInput) => Promise<void>;
}

const NONE_DOC_VALUE = "__none__";

export function PipeR1DocumentChecklist({
  pipeId,
  stage,
  checklist,
  documents,
  loading,
  templates,
  onPersist,
}: PipeR1DocumentChecklistProps) {
  const [collapsed, setCollapsed] = useState(isR1ChecklistPastStage(stage));

  useEffect(() => {
    setCollapsed(isR1ChecklistPastStage(stage));
  }, [pipeId, stage]);

  const updateItem = (itemId: string, patch: Partial<PipeR1ChecklistItemState>, noCreditOption = false) => {
    if (!checklist) return;
    const current = getChecklistItemState(checklist.items, itemId);
    let nextState: PipeR1ChecklistItemState = { ...current, ...patch };
    if (noCreditOption && patch.no_credit === true) {
      nextState = { ...nextState, received: false };
    }
    if (noCreditOption && patch.received === true) {
      nextState = { ...nextState, no_credit: false };
    }
    const items: PipeR1ChecklistItems = {
      ...checklist.items,
      [itemId]: nextState,
    };
    void onPersist({ items });
  };

  if (loading && !checklist) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Documents R1 — chargement…
      </div>
    );
  }

  if (!checklist || !templates) return null;

  const profile = {
    salarie: checklist.profile_salarie,
    chef_entreprise: checklist.profile_chef_entreprise,
    retraite: checklist.profile_retraite,
  };
  const progress = countR1ChecklistProgress(checklist, templates);
  const itemDefinitions = getActiveR1ChecklistItems(templates, profile);

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
              <p className="text-sm font-medium">Documents R1</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Suivi des pièces demandées au client (mail R1) — {progress.received} /{" "}
                {progress.total} reçu{progress.total > 1 ? "s" : ""}
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
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <ProfileToggle
              id="r1-salarie"
              label="Salarié"
              checked={checklist.profile_salarie}
              onCheckedChange={(checked) => {
                void onPersist({
                  profile_salarie: checked === true,
                  profile_chef_entreprise: checked === true ? false : undefined,
                });
              }}
            />
            <ProfileToggle
              id="r1-chef"
              label="Chef d'entreprise"
              checked={checklist.profile_chef_entreprise}
              onCheckedChange={(checked) => {
                void onPersist({
                  profile_chef_entreprise: checked === true,
                  profile_salarie: checked === true ? false : undefined,
                });
              }}
            />
            <ProfileToggle
              id="r1-retraite"
              label="Estimation retraite"
              checked={checklist.profile_retraite}
              onCheckedChange={(checked) => {
                void onPersist({ profile_retraite: checked === true });
              }}
            />
          </div>

          {itemDefinitions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune pièce configurée — utilisez Paramètres à côté des boutons Affaire / Suivi /
              Action.
            </p>
          ) : (
            <ul className="space-y-3">
              {itemDefinitions.map((def) => {
                const item = getChecklistItemState(checklist.items, def.id);
                const complete = isR1ChecklistItemComplete(def, item);
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
                        id={`r1-item-${def.id}`}
                        checked={item.received}
                        disabled={def.noCreditOption && item.no_credit === true}
                        onCheckedChange={(checked) => {
                          updateItem(def.id, { received: checked === true }, def.noCreditOption);
                        }}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <Label
                          htmlFor={`r1-item-${def.id}`}
                          className="text-sm font-normal leading-snug cursor-pointer"
                        >
                          {def.label}
                        </Label>
                        {def.hint ? (
                          <p className="text-xs text-muted-foreground mt-0.5">{def.hint}</p>
                        ) : null}
                      </div>
                    </div>

                    {def.noCreditOption ? (
                      <div className="flex items-center gap-2 pl-6">
                        <Checkbox
                          id={`r1-no-credit-${def.id}`}
                          checked={item.no_credit === true}
                          onCheckedChange={(checked) => {
                            updateItem(def.id, { no_credit: checked === true }, true);
                          }}
                        />
                        <Label
                          htmlFor={`r1-no-credit-${def.id}`}
                          className="text-xs font-normal cursor-pointer"
                        >
                          Pas de crédit
                        </Label>
                      </div>
                    ) : null}

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

function ProfileToggle({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Checkbox
        id={id}
        checked={checked}
        onCheckedChange={(value) => onCheckedChange(value === true)}
      />
      <Label htmlFor={id} className="text-xs font-normal cursor-pointer">
        {label}
      </Label>
    </div>
  );
}
