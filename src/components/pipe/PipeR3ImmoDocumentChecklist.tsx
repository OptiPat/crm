import { useEffect, useMemo, useState } from "react";
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
  PipeR3ImmoChecklistItemState,
  PipeR3ImmoChecklistItems,
  PipeR3ImmoDocumentChecklist,
  UpdatePipeR3ImmoDocumentChecklistInput,
} from "@/lib/api/tauri-pipe-r3-immo-checklist";
import { getDocumentTypeLabel } from "@/lib/documents/document-type-labels";
import {
  groupR3ImmoItemsBySection,
  type R3ImmoChecklistItemDef,
  type R3ImmoChecklistTemplate,
} from "@/lib/pipe/r3-immo-checklist-template";
import {
  countR3ImmoChecklistProgress,
  getActiveR3ImmoChecklistItems,
  getChecklistItemState,
  isR3ImmoChecklistItemComplete,
  isR3ImmoChecklistPastStage,
  type R3ImmoChecklistContext,
} from "@/lib/pipe/r3-immo-document-checklist";
import { formatR3ImmoRevenueProfileLabel } from "@/lib/pipe/r3-immo-r1-profile-sync";
import { cn } from "@/lib/utils";

interface PipeR3ImmoDocumentChecklistProps {
  pipeId: number;
  stage: string;
  checklist: PipeR3ImmoDocumentChecklist | null;
  checklistContext: R3ImmoChecklistContext | null;
  checklistTemplate: R3ImmoChecklistTemplate | null;
  documents: Document[];
  loading: boolean;
  onPersist: (update: UpdatePipeR3ImmoDocumentChecklistInput) => Promise<void>;
}

const NONE_DOC_VALUE = "__none__";

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
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

function groupItemsBySection(
  items: R3ImmoChecklistItemDef[],
  template: R3ImmoChecklistTemplate
): { section: string; items: R3ImmoChecklistItemDef[] }[] {
  return groupR3ImmoItemsBySection(items, template);
}

export function PipeR3ImmoDocumentChecklist({
  pipeId,
  stage,
  checklist,
  checklistContext,
  checklistTemplate,
  documents,
  loading,
  onPersist,
}: PipeR3ImmoDocumentChecklistProps) {
  const [collapsed, setCollapsed] = useState(isR3ImmoChecklistPastStage(stage));

  useEffect(() => {
    setCollapsed(isR3ImmoChecklistPastStage(stage));
  }, [pipeId, stage]);

  const updateItem = (itemId: string, patch: Partial<PipeR3ImmoChecklistItemState>) => {
    if (!checklist) return;
    const current = getChecklistItemState(checklist.items, itemId);
    const items: PipeR3ImmoChecklistItems = {
      ...checklist.items,
      [itemId]: { ...current, ...patch },
    };
    void onPersist({ items });
  };

  const activeItems = useMemo(
    () =>
      checklistContext && checklistTemplate
        ? getActiveR3ImmoChecklistItems(checklistContext, checklistTemplate)
        : [],
    [checklistContext, checklistTemplate]
  );
  const sections = useMemo(
    () => (checklistTemplate ? groupItemsBySection(activeItems, checklistTemplate) : []),
    [activeItems, checklistTemplate]
  );

  if ((loading && !checklist) || !checklistTemplate) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Documents R3 — Immo — chargement…
      </div>
    );
  }

  if (!checklist || !checklistContext) return null;

  const progress = countR3ImmoChecklistProgress(checklist, checklistContext, checklistTemplate);
  const revenueFromR1 = checklistContext.revenueProfileSource === "r1";
  const revenueLabel = formatR3ImmoRevenueProfileLabel(checklistContext.checklist);

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
              <p className="text-sm font-medium">Documents R3 — Immobilier</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                Pièces dossier prêt — {progress.received} / {progress.total} reçu
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
          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Profil revenus
            </p>
            {revenueFromR1 && revenueLabel ? (
              <p className="text-sm text-muted-foreground">
                Repris automatiquement du R1 :{" "}
                <span className="font-medium text-foreground">{revenueLabel}</span>
              </p>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                <ProfileToggle
                  id="r3-immo-salarie"
                  label="Salarié"
                  checked={checklist.profile_salarie}
                  onCheckedChange={(checked) => {
                    void onPersist({
                      profile_salarie: checked,
                      profile_chef_entreprise: checked ? false : undefined,
                    });
                  }}
                />
                <ProfileToggle
                  id="r3-immo-chef"
                  label="Chef d'entreprise"
                  checked={checklist.profile_chef_entreprise}
                  onCheckedChange={(checked) => {
                    void onPersist({
                      profile_chef_entreprise: checked,
                      profile_salarie: checked ? false : undefined,
                    });
                  }}
                />
              </div>
            )}
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Situation dossier
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <ProfileToggle
                id="r3-immo-pm"
                label="Emprunteur personne morale (SCI)"
                checked={checklist.emprunteur_personne_morale}
                onCheckedChange={(checked) => {
                  void onPersist({ emprunteur_personne_morale: checked });
                }}
              />
              <ProfileToggle
                id="r3-immo-fonciers"
                label="Revenus fonciers hors micro"
                checked={checklist.revenus_fonciers_hors_micro}
                onCheckedChange={(checked) => {
                  void onPersist({ revenus_fonciers_hors_micro: checked });
                }}
              />
              <ProfileToggle
                id="r3-immo-sci-revenus"
                label="Revenus via SCI"
                checked={checklist.revenus_via_sci}
                onCheckedChange={(checked) => {
                  void onPersist({ revenus_via_sci: checked });
                }}
              />
            </div>
          </div>

          <div className="space-y-3">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Type de projet
            </p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              <ProfileToggle
                id="r3-immo-vefa"
                label="VEFA"
                checked={checklist.projet_vefa}
                onCheckedChange={(checked) => {
                  void onPersist({ projet_vefa: checked });
                }}
              />
              <ProfileToggle
                id="r3-immo-ancien"
                label="Ancien"
                checked={checklist.projet_ancien}
                onCheckedChange={(checked) => {
                  void onPersist({ projet_ancien: checked });
                }}
              />
              <ProfileToggle
                id="r3-immo-scpi"
                label="SCPI"
                checked={checklist.projet_scpi}
                onCheckedChange={(checked) => {
                  void onPersist({ projet_scpi: checked });
                }}
              />
            </div>
          </div>

          {sections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Aucune pièce active — cochez les options ci-dessus ou complétez la fiche contact.
            </p>
          ) : (
            sections.map(({ section, items }) => (
              <div key={section} className="space-y-2">
                <p className="text-xs font-semibold text-foreground/80">{section}</p>
                <ul className="space-y-3">
                  {items.map((def) => {
                    const item = getChecklistItemState(checklist.items, def.id);
                    const complete = isR3ImmoChecklistItemComplete(item);
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
                            id={`r3-immo-item-${def.id}`}
                            checked={item.received}
                            onCheckedChange={(checked) => {
                              updateItem(def.id, { received: checked === true });
                            }}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <Label
                              htmlFor={`r3-immo-item-${def.id}`}
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
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
