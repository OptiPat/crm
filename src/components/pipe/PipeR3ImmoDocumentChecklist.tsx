import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Document } from "@/lib/api/tauri-documents";
import { PipeChecklistDocumentLink } from "@/components/pipe/PipeChecklistDocumentLink";
import type {
  PipeR3ImmoChecklistItemState,
  PipeR3ImmoChecklistItems,
  PipeR3ImmoDocumentChecklist,
  UpdatePipeR3ImmoDocumentChecklistInput,
} from "@/lib/api/tauri-pipe-r3-immo-checklist";
import {
  groupR3ImmoItemsBySection,
  type R3ImmoChecklistItemDef,
  type R3ImmoChecklistTemplate,
} from "@/lib/pipe/r3-immo-checklist-template";
import {
  countR3ImmoChecklistProgress,
  countR3ImmoItemsProgress,
  describeR3ImmoItemVisibility,
  getActiveR3ImmoChecklistItems,
  getChecklistItemState,
  isR3ImmoChecklistItemComplete,
  isR3ImmoChecklistPastStage,
  type R3ImmoChecklistContext,
} from "@/lib/pipe/r3-immo-document-checklist";
import { formatR3ImmoRevenueProfileLabel } from "@/lib/pipe/r3-immo-r1-profile-sync";
import { suggestedDocumentTypeForChecklistItem } from "@/lib/pipe/pipe-checklist-document-import";
import { cn } from "@/lib/utils";

interface PipeR3ImmoDocumentChecklistProps {
  pipeId: number;
  stage: string;
  contactId: number;
  checklist: PipeR3ImmoDocumentChecklist | null;
  checklistContext: R3ImmoChecklistContext | null;
  checklistTemplate: R3ImmoChecklistTemplate | null;
  documents: Document[];
  loading: boolean;
  onPersist: (update: UpdatePipeR3ImmoDocumentChecklistInput) => Promise<boolean>;
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

function R3ImmoChecklistItemRow({
  def,
  item,
  contactId,
  checklistContext,
  documents,
  showDocumentLink,
  onToggleReceived,
  onLinkDocument,
  onExpandLink,
  onDocumentImported,
}: {
  def: R3ImmoChecklistItemDef;
  item: PipeR3ImmoChecklistItemState;
  contactId: number;
  checklistContext: R3ImmoChecklistContext;
  documents: Document[];
  showDocumentLink: boolean;
  onToggleReceived: (received: boolean) => void;
  onLinkDocument: (documentId: number | null) => void | Promise<void>;
  onExpandLink: () => void;
  onDocumentImported?: (doc: Document) => void;
}) {
  const complete = isR3ImmoChecklistItemComplete(item);
  const visibilityReason = describeR3ImmoItemVisibility(def.rule, checklistContext);

  return (
    <li
      className={cn(
        "rounded-lg border border-border bg-background/80 px-3 py-2.5 space-y-2",
        complete && "bg-emerald-50/40 dark:bg-emerald-950/15"
      )}
    >
      <div className="flex items-start gap-2">
        <Checkbox
          id={`r3-immo-item-${def.id}`}
          checked={item.received}
          onCheckedChange={(checked) => onToggleReceived(checked === true)}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1 space-y-1">
          <Label
            htmlFor={`r3-immo-item-${def.id}`}
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

export function PipeR3ImmoDocumentChecklist({
  pipeId,
  stage,
  contactId,
  checklist,
  checklistContext,
  checklistTemplate,
  documents,
  loading,
  onPersist,
  onDocumentImported,
  linkItemDocument,
}: PipeR3ImmoDocumentChecklistProps) {
  const [collapsed, setCollapsed] = useState(isR3ImmoChecklistPastStage(stage));
  const [contextOpen, setContextOpen] = useState(true);
  const [missingOnly, setMissingOnly] = useState(false);
  const [sectionCollapsed, setSectionCollapsed] = useState<Record<string, boolean>>({});
  const [linkExpandedIds, setLinkExpandedIds] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setCollapsed(isR3ImmoChecklistPastStage(stage));
    setMissingOnly(false);
    setLinkExpandedIds(new Set());
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
    () => (checklistTemplate ? groupR3ImmoItemsBySection(activeItems, checklistTemplate) : []),
    [activeItems, checklistTemplate]
  );

  useEffect(() => {
    setSectionCollapsed({});
  }, [pipeId]);

  useEffect(() => {
    if (!checklist || sections.length === 0) return;
    setSectionCollapsed((prev) => {
      const next = { ...prev };
      for (const { section, items } of sections) {
        if (section in next) continue;
        const prog = countR3ImmoItemsProgress(checklist, items);
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
          (def) => !isR3ImmoChecklistItemComplete(getChecklistItemState(checklist.items, def.id))
        ),
      }))
      .filter(({ items }) => items.length > 0);
  }, [checklist, missingOnly, sections]);

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
  const missingCount = progress.total - progress.received;

  const contextSummaryParts: string[] = [];
  if (revenueFromR1 && revenueLabel) {
    contextSummaryParts.push(`Revenus : ${revenueLabel}`);
  } else if (checklist.profile_salarie) {
    contextSummaryParts.push("Salarié");
  } else if (checklist.profile_chef_entreprise) {
    contextSummaryParts.push("Chef d'entreprise");
  }
  if (checklist.emprunteur_personne_morale) contextSummaryParts.push("PM");
  if (checklist.revenus_fonciers_hors_micro) contextSummaryParts.push("Foncier");
  if (checklist.revenus_via_sci) contextSummaryParts.push("SCI");
  if (checklist.projet_vefa) contextSummaryParts.push("VEFA");
  if (checklist.projet_ancien) contextSummaryParts.push("Ancien");
  if (checklist.projet_scpi) contextSummaryParts.push("SCPI");

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
              <div className="px-3 pb-3 space-y-4 border-t border-border/40">
                <div className="space-y-2 pt-3">
                  <p className="text-xs font-medium text-muted-foreground">Profil revenus</p>
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
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Situation dossier</p>
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
                <div className="space-y-2">
                  <p className="text-xs font-medium text-muted-foreground">Type de projet</p>
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
              </div>
            ) : null}
          </div>

          {sections.length > 0 ? (
            <div className="flex items-center gap-2">
              <Checkbox
                id="r3-immo-missing-only"
                checked={missingOnly}
                onCheckedChange={(v) => setMissingOnly(v === true)}
              />
              <Label htmlFor="r3-immo-missing-only" className="text-sm font-normal cursor-pointer">
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
                : "Aucune pièce active — complétez le contexte ou la fiche contact."}
            </p>
          ) : (
            filteredSections.map(({ section, items }) => {
              const sectionProgress = countR3ImmoItemsProgress(checklist, items);
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
                          <R3ImmoChecklistItemRow
                            key={def.id}
                            def={def}
                            item={item}
                            contactId={contactId}
                            checklistContext={checklistContext}
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
