import { useEffect, useRef, useState } from "react";
import { Calendar, FileText, Pencil, Phone, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import { PipeTimelinePhaseEntryRow } from "@/components/pipe/PipeTimelinePhaseEntryRow";
import { PipeProspectionMilestoneEditor } from "@/components/pipe/PipeProspectionMilestoneEditor";
import { PipeProspectionMilestoneReadSummary } from "@/components/pipe/PipeProspectionMilestoneReadSummary";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { groupPipeTimelineByYearMonth } from "@/lib/pipe/pipe-timeline-groups";
import {
  formatTimelineEntryBadgeLabel,
  formatTimelineEntryContenu,
  formatTimelineEntryTitre,
  getPipeTimelineEntryStyle,
  isPipeTimelineSystemEntry,
  isStageMilestoneEntry,
  timelineStageFromEntry,
  type PipeTimelineDisplayContext,
} from "@/lib/pipe/pipe-timeline-display";
import { getMilestoneDurationLabel } from "@/lib/pipe/pipe-timeline-duration";
import {
  milestoneStageExpectsRdv,
  phaseEntriesHaveRdv,
} from "@/lib/pipe/pipe-rdv-delete";
import {
  isProspectionMilestoneEntry,
} from "@/lib/pipe/pipe-prospection-phase";
import {
  getAllStagePhaseUserEntryIds,
  getCanonicalStageMilestones,
  getPhaseUserEntriesForMilestone,
} from "@/lib/pipe/pipe-stage-phase";
import { formatTimelineOccurredAt } from "@/lib/pipe/pipe-timeline-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPE_ICONS = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  PROPOSITION: Send,
} as const;

interface PipeTimelineHistoryProps {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe: Pick<PipeRecord, "pipe_type" | "contact_id" | "id" | "stage">;
  focusProspectionToken?: number;
}

function TimelineEntryRow({
  entry,
  allEntries,
  context,
  pipe,
  contactId,
  phaseEntries,
  timeline,
  onDelete,
  onSaveMilestoneNotes,
  isLast,
  prospectionMilestoneRef,
  highlightProspection,
}: {
  entry: PipeTimelineEntryRecord;
  allEntries: PipeTimelineEntryRecord[];
  context: PipeTimelineDisplayContext;
  pipe: Pick<PipeRecord, "pipe_type" | "contact_id" | "id" | "stage">;
  contactId: number;
  phaseEntries: PipeTimelineEntryRecord[];
  timeline: ReturnType<typeof usePipeTimeline>;
  onDelete?: () => void;
  onSaveMilestoneNotes?: (contenu: string | null) => Promise<void>;
  isLast: boolean;
  prospectionMilestoneRef?: React.RefObject<HTMLLIElement | null>;
  highlightProspection?: boolean;
}) {
  const milestone = isStageMilestoneEntry(entry.entry_type);
  const prospectionMilestone = isProspectionMilestoneEntry(entry, context);
  const [editing, setEditing] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");
  const [saving, setSaving] = useState(false);

  const userType = entry.entry_type;
  const Icon =
    !milestone && userType in TYPE_ICONS
      ? TYPE_ICONS[userType as keyof typeof TYPE_ICONS]
      : null;
  const label = formatTimelineEntryBadgeLabel(entry, context);
  const displayTitre = formatTimelineEntryTitre(entry);
  const displayContenu = formatTimelineEntryContenu(entry);
  const style = getPipeTimelineEntryStyle(entry, context);
  const durationLabel = getMilestoneDurationLabel(entry, allEntries, context);
  const milestoneStage = timelineStageFromEntry(entry, context);
  const showNoRdvHint =
    milestone &&
    !prospectionMilestone &&
    milestoneStageExpectsRdv(milestoneStage) &&
    !phaseEntriesHaveRdv(phaseEntries);

  const startEdit = () => {
    setDraftNotes(entry.contenu ?? "");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftNotes("");
  };

  const saveMilestoneNotes = async () => {
    if (!onSaveMilestoneNotes) return;
    setSaving(true);
    try {
      const trimmed = draftNotes.trim();
      await onSaveMilestoneNotes(trimmed || null);
      toast.success(prospectionMilestone ? "Prospection enregistrée" : "Notes enregistrées");
      setEditing(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <li
      ref={prospectionMilestone ? prospectionMilestoneRef : undefined}
      className={cn(
        "relative pl-6",
        !isLast && "pb-6",
        highlightProspection &&
          prospectionMilestone &&
          "rounded-lg ring-2 ring-primary/40 ring-offset-2 ring-offset-background"
      )}
    >
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
        {durationLabel && (
          <p className="mb-2 text-[11px] font-medium text-muted-foreground">{durationLabel}</p>
        )}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-2 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className={cn("font-normal gap-1 border", style.badge)}>
                {Icon && <Icon className="h-3 w-3" />}
                {label}
              </Badge>
              <time className="text-xs text-muted-foreground">
                {formatTimelineOccurredAt(entry.occurred_at)}
              </time>
            </div>

            {displayTitre && (
              <p className="text-sm font-medium leading-snug">{displayTitre}</p>
            )}

            {editing && prospectionMilestone ? (
              <PipeProspectionMilestoneEditor
                contactId={contactId}
                pipe={pipe}
                phaseEntries={phaseEntries}
                draftNotes={draftNotes}
                saving={saving}
                timeline={timeline}
                onDraftNotesChange={setDraftNotes}
                onCancel={cancelEdit}
                onSaveNotes={saveMilestoneNotes}
                onAfterEntryAdded={cancelEdit}
              />
            ) : editing ? (
              <div className="space-y-2">
                <DictationTextarea
                  value={draftNotes}
                  onChange={setDraftNotes}
                  rows={4}
                  placeholder="Notes pour cette étape…"
                  disabled={saving}
                />
                <div className="flex justify-end gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={cancelEdit}
                    disabled={saving}
                  >
                    Annuler
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={() => void saveMilestoneNotes()}
                    disabled={saving}
                  >
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                </div>
              </div>
            ) : prospectionMilestone && contactId > 0 ? (
              <>
                {displayContenu ? (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {displayContenu}
                  </p>
                ) : (
                  <p className="text-xs text-muted-foreground italic">
                    Aucune note pour cette étape.
                  </p>
                )}
                <PipeProspectionMilestoneReadSummary
                  contactId={contactId}
                  phaseEntries={phaseEntries}
                  pipe={pipe}
                  timeline={timeline}
                />
              </>
            ) : (
              <>
                {displayContenu ? (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {displayContenu}
                  </p>
                ) : milestone ? (
                  <p className="text-xs text-muted-foreground italic">
                    Aucune note pour cette étape.
                  </p>
                ) : null}
                {showNoRdvHint ? (
                  <p className="text-xs text-muted-foreground italic mt-2 rounded-md border border-dashed px-3 py-2">
                    Aucun RDV enregistré pour cette étape.
                  </p>
                ) : null}
                {milestone && !prospectionMilestone && phaseEntries.length > 0 ? (
                  <ul className="space-y-2 m-0 list-none p-0 mt-2">
                    {phaseEntries.map((phaseEntry) => (
                      <PipeTimelinePhaseEntryRow
                        key={phaseEntry.id}
                        entry={phaseEntry}
                        pipe={pipe}
                        timeline={timeline}
                      />
                    ))}
                  </ul>
                ) : null}
              </>
            )}
          </div>

          <div className="flex shrink-0 gap-0.5">
            {milestone && onSaveMilestoneNotes && !editing && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label={
                  prospectionMilestone
                    ? "Modifier la prospection"
                    : "Modifier les notes de l'étape"
                }
                onClick={startEdit}
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
            {onDelete && !editing && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Supprimer l'entrée"
                onClick={onDelete}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
      </article>
    </li>
  );
}

export function PipeTimelineHistory({
  timeline,
  pipe,
  focusProspectionToken = 0,
}: PipeTimelineHistoryProps) {
  const { entries, loading, removeEntry, updateMilestoneNotes } = timeline;
  const prospectionMilestoneRef = useRef<HTMLLIElement>(null);
  const [highlightProspection, setHighlightProspection] = useState(false);
  const context: PipeTimelineDisplayContext = {
    pipeType: pipe.pipe_type,
  };
  const stageMilestones = getCanonicalStageMilestones(entries, context);
  const nestedPhaseEntryIds = getAllStagePhaseUserEntryIds(entries, context);

  const visibleEntries = entries.filter((entry) => !nestedPhaseEntryIds.has(entry.id));

  useEffect(() => {
    if (!focusProspectionToken) return;
    const frame = requestAnimationFrame(() => {
      prospectionMilestoneRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "nearest",
      });
      setHighlightProspection(true);
    });
    const timer = window.setTimeout(() => setHighlightProspection(false), 2400);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timer);
    };
  }, [focusProspectionToken]);

  const handleDelete = async (entry: PipeTimelineEntryRecord) => {
    if (isPipeTimelineSystemEntry(entry.entry_type)) return;
    try {
      await removeEntry(entry.id);
      toast.success("Entrée supprimée");
    } catch (err) {
      toast.error(String(err));
    }
  };

  if (loading) {
    return <p className="text-sm text-muted-foreground">Chargement de l&apos;historique…</p>;
  }

  if (entries.length === 0) {
    return (
      <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-6 text-center">
        Aucune entrée pour le moment. Utilisez l&apos;onglet Suivi pour ajouter un appel, un RDV
        ou une note.
      </p>
    );
  }

  const grouped = groupPipeTimelineByYearMonth(visibleEntries);

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
                  <TimelineEntryRow
                    key={entry.id}
                    entry={entry}
                    allEntries={entries}
                    context={context}
                    pipe={pipe}
                    contactId={pipe.contact_id}
                    phaseEntries={
                      isStageMilestoneEntry(entry.entry_type)
                        ? getPhaseUserEntriesForMilestone(entry, stageMilestones, entries)
                        : []
                    }
                    timeline={timeline}
                    prospectionMilestoneRef={prospectionMilestoneRef}
                    highlightProspection={highlightProspection}
                    isLast={index === monthGroup.items.length - 1}
                    onSaveMilestoneNotes={
                      isStageMilestoneEntry(entry.entry_type)
                        ? async (contenu) => {
                            await updateMilestoneNotes(entry.id, contenu);
                          }
                        : undefined
                    }
                    onDelete={
                      isPipeTimelineSystemEntry(entry.entry_type)
                        ? undefined
                        : () => void handleDelete(entry)
                    }
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

