import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Document } from "@/lib/api/tauri-documents";
import { PipeChecklistDocumentLink } from "@/components/pipe/PipeChecklistDocumentLink";
import type {
  PipeR1ChecklistItemState,
  PipeR1ChecklistItems,
  PipeR1DocumentChecklist,
  UpdatePipeR1DocumentChecklistInput,
} from "@/lib/api/tauri-pipe-r1-checklist";
import type { PipeChecklistTemplateItem, PipeChecklistTemplates } from "@/lib/pipe/pipe-checklist-template";
import {
  checklistProfileFromRecord,
  countR1ChecklistProgress,
  countR1ItemsProgress,
  describeR1ItemVisibility,
  getActiveR1ChecklistItems,
  getChecklistItemState,
  groupR1ItemsBySection,
  isR1ChecklistItemComplete,
  isR1ChecklistPastStage,
} from "@/lib/pipe/r1-document-checklist";
import { suggestedDocumentTypeForChecklistItem } from "@/lib/pipe/pipe-checklist-document-import";
import { cn } from "@/lib/utils";

interface PipeR1DocumentChecklistProps {
  pipeId: number;
  stage: string;
  contactId: number;
  checklist: PipeR1DocumentChecklist | null;
  documents: Document[];
  loading: boolean;
  templates: PipeChecklistTemplates | null;
  onPersist: (update: UpdatePipeR1DocumentChecklistInput) => Promise<boolean>;
  onDocumentImported?: (doc: Document) => void;
  linkItemDocument: (itemId: string, documentId: number | null) => Promise<void>;
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
      <Checkbox id={id} checked={checked} onCheckedChange={(v) => onCheckedChange(v === true)} />
      <Label htmlFor={id} className="text-sm font-normal cursor-pointer">
        {label}
      </Label>
    </div>
  );
}

function R1ChecklistItemRow({
  def,
  item,
  contactId,
  documents,
  showDocumentLink,
  onToggleReceived,
  onToggleNoCredit,
  onLinkDocument,
  onExpandLink,
  onDocumentImported,
}: {
  def: PipeChecklistTemplateItem;
  item: PipeR1ChecklistItemState;
  contactId: number;
  documents: Document[];
  showDocumentLink: boolean;
  onToggleReceived: (received: boolean) => void;
  onToggleNoCredit: (noCredit: boolean) => void;
  onLinkDocument: (documentId: number | null) => void | Promise<void>;
  onExpandLink: () => void;
  onDocumentImported?: (doc: Document) => void;
}) {
  const complete = isR1ChecklistItemComplete(def, item);
  const visibilityReason = describeR1ItemVisibility(def);

  return (
    <li
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
          onCheckedChange={(checked) => onToggleReceived(checked === true)}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <Label
            htmlFor={`r1-item-${def.id}`}
            className="text-sm font-normal leading-snug cursor-pointer"
          >
            {def.label}
          </Label>
          {def.hint ? (
            <p className="text-xs text-muted-foreground leading-snug">{def.hint}</p>
          ) : null}
          {visibilityReason ? (
            <Badge variant="outline" className="text-[10px] font-normal px-1.5 py-0 h-5">
              {visibilityReason}
            </Badge>
          ) : null}
        </div>
      </div>

      {def.noCreditOption ? (
        <div className="flex items-center gap-2 pl-6">
          <Checkbox
            id={`r1-no-credit-${def.id}`}
            checked={item.no_credit === true}
            onCheckedChange={(checked) => onToggleNoCredit(checked === true)}
          />
          <Label htmlFor={`r1-no-credit-${def.id}`} className="text-xs font-normal cursor-pointer">
            Pas de crédit
          </Label>
        </div>
      ) : null}

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

export function PipeR1DocumentChecklist({
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
}: PipeR1DocumentChecklistProps) {
  const [collapsed, setCollapsed] = useState(isR1ChecklistPastStage(stage));
  const [contextOpen, setContextOpen] = useState(true);
  const [missingOnly, setMissingOnly] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({});
  const [linkExpandedIds, setLinkExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsed(isR1ChecklistPastStage(stage));
    setMissingOnly(false);
    setLinkExpandedIds(new Set());
  }, [pipeId, stage]);

  const updateItem = (
    itemId: string,
    patch: Partial<PipeR1ChecklistItemState>,
    noCreditOption = false
  ) => {
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

  const profile = checklist ? checklistProfileFromRecord(checklist) : null;

  const activeItems = useMemo(
    () => (templates && profile ? getActiveR1ChecklistItems(templates, profile) : []),
    [templates, profile]
  );

  const sections = useMemo(() => groupR1ItemsBySection(activeItems), [activeItems]);

  useEffect(() => {
    setSectionCollapsed({});
  }, [pipeId]);

  useEffect(() => {
    if (!checklist || sections.length === 0) return;
    setSectionCollapsed((prev) => {
      const next = { ...prev };
      for (const { section, items } of sections) {
        if (section in next) continue;
        const prog = countR1ItemsProgress(checklist, items);
        next[section] = prog.total > 0 && prog.received === prog.total;
      }
      return next;
    });
  }, [checklist, sections]);

  const filteredSections = useMemo(() => {
    if (!checklist || !missingOnly) return sections;
    return sections
      .map(({ section, items }) => ({
        section,
        items: items.filter(
          (def) => !isR1ChecklistItemComplete(def, getChecklistItemState(checklist.items, def.id))
        ),
      }))
      .filter(({ items }) => items.length > 0);
  }, [checklist, missingOnly, sections]);

  if (loading && !checklist) {
    return (
      <div className="rounded-xl border bg-muted/20 px-4 py-3 text-sm text-muted-foreground flex items-center gap-2">
        <Loader2 className="h-4 w-4 animate-spin shrink-0" />
        Documents R1 — chargement…
      </div>
    );
  }

  if (!checklist || !templates) return null;

  const progress = countR1ChecklistProgress(checklist, templates);
  const missingCount = progress.total - progress.received;

  const contextSummaryParts: string[] = [];
  if (checklist.profile_salarie) contextSummaryParts.push("Salarié");
  if (checklist.profile_chef_entreprise) contextSummaryParts.push("Chef d'entreprise");
  if (checklist.profile_retraite) contextSummaryParts.push("Retraite");

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
          <div className="rounded-lg border border-border/60 bg-background/50 overflow-hidden">
            <button
              type="button"
              className="flex w-full items-center gap-2 px-3 py-2.5 text-left hover:bg-muted/30"
              onClick={() => setContextOpen((v) => !v)}
            >
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                  !contextOpen && "-rotate-90"
                )}
              />
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                Contexte dossier
              </span>
              {!contextOpen && contextSummaryParts.length > 0 ? (
                <span className="text-xs text-muted-foreground truncate ml-1">
                  — {contextSummaryParts.join(" · ")}
                </span>
              ) : null}
            </button>
            {contextOpen ? (
              <div className="px-3 pb-3 border-t border-border/40 pt-3">
                <p className="text-xs font-medium text-muted-foreground mb-2">Profil revenus</p>
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  <ProfileToggle
                    id="r1-salarie"
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
                    id="r1-chef"
                    label="Chef d'entreprise"
                    checked={checklist.profile_chef_entreprise}
                    onCheckedChange={(checked) => {
                      void onPersist({
                        profile_chef_entreprise: checked,
                        profile_salarie: checked ? false : undefined,
                      });
                    }}
                  />
                  <ProfileToggle
                    id="r1-retraite"
                    label="Estimation retraite"
                    checked={checklist.profile_retraite}
                    onCheckedChange={(checked) => {
                      void onPersist({ profile_retraite: checked });
                    }}
                  />
                </div>
              </div>
            ) : null}
          </div>

          {sections.length > 0 ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="r1-missing-only"
                checked={missingOnly}
                onCheckedChange={(v) => setMissingOnly(v === true)}
              />
              <Label htmlFor="r1-missing-only" className="text-sm font-normal cursor-pointer">
                Afficher seulement les manquantes
                {missingCount > 0 ? (
                  <span className="text-muted-foreground"> ({missingCount})</span>
                ) : null}
              </Label>
            </div>
          ) : null}

          {filteredSections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {missingOnly && sections.length > 0
                ? "Toutes les pièces actives sont reçues."
                : "Aucune pièce configurée — utilisez Paramètres à côté des boutons Affaire / Suivi / Action."}
            </p>
          ) : (
            filteredSections.map(({ section, items }) => {
              const sectionProgress = countR1ItemsProgress(checklist, items);
              const isSectionCollapsed = sectionCollapsed[section] ?? false;

              return (
                <div key={section} className="rounded-lg border border-border/50 overflow-hidden">
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left bg-muted/30 hover:bg-muted/50"
                    onClick={() =>
                      setSectionCollapsed((prev) => ({
                        ...prev,
                        [section]: !prev[section],
                      }))
                    }
                  >
                    <ChevronDown
                      className={cn(
                        "h-4 w-4 shrink-0 text-muted-foreground transition-transform",
                        isSectionCollapsed && "-rotate-90"
                      )}
                    />
                    <span className="text-xs font-semibold text-foreground/90 flex-1 min-w-0 truncate">
                      {section}
                    </span>
                    <Badge variant="outline" className="tabular-nums text-[10px] shrink-0">
                      {sectionProgress.received}/{sectionProgress.total}
                    </Badge>
                  </button>
                  {!isSectionCollapsed ? (
                    <ul className="space-y-3 p-3 pt-2">
                      {items.map((def) => {
                        const item = getChecklistItemState(checklist.items, def.id);
                        const showDocumentLink =
                          item.received ||
                          item.document_id != null ||
                          linkExpandedIds.has(def.id);

                        return (
                          <R1ChecklistItemRow
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
                              updateItem(def.id, { received }, def.noCreditOption);
                            }}
                            onToggleNoCredit={(noCredit) => {
                              updateItem(def.id, { no_credit: noCredit }, true);
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
                  ) : null}
                </div>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}
