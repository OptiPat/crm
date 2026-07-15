import { useEffect, useMemo, useRef, useState } from "react";
import { Calendar, FileText, Pencil, Phone, Send, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PipeTimelinePhaseEntryRow } from "@/components/pipe/PipeTimelinePhaseEntryRow";
import { PipeProspectionMilestoneEditor } from "@/components/pipe/PipeProspectionMilestoneEditor";
import { PipeProspectionMilestoneReadSummary } from "@/components/pipe/PipeProspectionMilestoneReadSummary";
import { PipeRdvOutcomeDialog } from "@/components/pipe/PipeRdvOutcomeDialog";
import { PipeTimelineResumeRdvForm } from "@/components/pipe/PipeTimelineResumeRdvForm";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  listPlacementOperationsForPipe,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
} from "@/lib/api/tauri-box-placement";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { toastAfterPipeRdvReschedule } from "@/lib/pipe/pipe-rdv-entry-actions";
import { applyPipeSuiviRdvReschedule } from "@/lib/pipe/pipe-rdv-reschedule-actions";
import { isSuiviRdvEntry, PIPE_TYPE_SUIVI } from "@/lib/pipe/pipe-suivi";
import { groupPipeTimelineByYearMonth } from "@/lib/pipe/pipe-timeline-groups";
import {
  buildSuiviPlacementTimelineHints,
  formatTimelineEntryBadgeLabel,
  formatTimelineEntryContenu,
  formatTimelineEntryTitre,
  getPipeTimelineEntryStyle,
  isPipeTimelineSystemEntry,
  isStageMilestoneEntry,
  type PipeTimelineDisplayContext,
  type SuiviPlacementTimelineHints,
} from "@/lib/pipe/pipe-timeline-display";
import { buildFlatTimelineDurationLabels } from "@/lib/pipe/pipe-timeline-duration";
import { isFlatTimelineUserEntry } from "@/lib/pipe/pipe-timeline-flat";
import {
  canResumeRdvFromCancelledTrace,
  isRdvTimelineTraceNote,
  listRdvEntriesForStage,
  parseRdvTimelineTraceNote,
} from "@/lib/pipe/pipe-rdv-delete";
import {
  getCanonicalStageMilestones,
  getPhaseUserEntriesForMilestone,
  getVisiblePipeTimelineEntries,
} from "@/lib/pipe/pipe-stage-phase";
import { isProspectionMilestoneEntry } from "@/lib/pipe/pipe-prospection-phase";
import { formatTimelineOccurredAt, datetimeLocalToUnix, unixToDatetimeLocalInput } from "@/lib/pipe/pipe-timeline-types";
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
  pipe: Pick<
    PipeRecord,
    "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom" | "titre" | "id" | "stage"
  >;
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
  flatDurationLabel,
}: {
  entry: PipeTimelineEntryRecord;
  allEntries: PipeTimelineEntryRecord[];
  context: PipeTimelineDisplayContext;
  pipe: Pick<
    PipeRecord,
    "pipe_type" | "contact_id" | "contact_prenom" | "contact_nom" | "titre" | "id" | "stage"
  >;
  contactId: number;
  phaseEntries: PipeTimelineEntryRecord[];
  timeline: ReturnType<typeof usePipeTimeline>;
  onDelete?: () => void;
  onSaveMilestoneNotes?: (contenu: string | null) => Promise<void>;
  isLast: boolean;
  prospectionMilestoneRef?: React.RefObject<HTMLLIElement | null>;
  highlightProspection?: boolean;
  flatDurationLabel?: string | null;
}) {
  const milestone = isStageMilestoneEntry(entry.entry_type);
  const prospectionMilestone = isProspectionMilestoneEntry(entry, context);
  const [editing, setEditing] = useState(false);
  const [draftNotes, setDraftNotes] = useState("");
  const [traceOccurredAt, setTraceOccurredAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [rdvOutcomeOpen, setRdvOutcomeOpen] = useState(false);
  const [resumeRdvOpen, setResumeRdvOpen] = useState(false);
  const [suiviRdvRescheduleOpen, setSuiviRdvRescheduleOpen] = useState(false);
  const [suiviOccurredAt, setSuiviOccurredAt] = useState("");
  const [suiviContenu, setSuiviContenu] = useState("");
  const [suiviSaving, setSuiviSaving] = useState(false);

  const userType = entry.entry_type;
  const suiviRdv = entry.entry_type === "RDV" && isSuiviRdvEntry(entry);
  const traceNote = isRdvTimelineTraceNote(entry);
  const traceMeta = traceNote ? parseRdvTimelineTraceNote(entry.contenu) : null;
  const activeRdvForTrace =
    traceMeta?.kind === "rescheduled"
      ? listRdvEntriesForStage(allEntries, traceMeta.stage)[0]
      : undefined;
  const canResumeCancelledRdv =
    canResumeRdvFromCancelledTrace(traceMeta, allEntries, pipe.pipe_type) && !resumeRdvOpen;
  const Icon =
    !milestone && (traceNote || userType in TYPE_ICONS)
      ? traceNote
        ? Calendar
        : TYPE_ICONS[userType as keyof typeof TYPE_ICONS]
      : null;
  const label = formatTimelineEntryBadgeLabel(entry, context);
  const displayTitre = formatTimelineEntryTitre(entry);
  const displayContenu = formatTimelineEntryContenu(entry);
  const style = getPipeTimelineEntryStyle(entry, context);
  const durationLabel = flatDurationLabel ?? null;
  const hideEmptyMilestoneNote =
    entry.entry_type === "CREATION" && pipe.pipe_type === PIPE_TYPE_SUIVI;

  const startEdit = () => {
    setDraftNotes(entry.contenu ?? "");
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setDraftNotes("");
    setTraceOccurredAt("");
    setResumeRdvOpen(false);
  };

  const startTraceEdit = () => {
    setDraftNotes(entry.contenu ?? "");
    setTraceOccurredAt(unixToDatetimeLocalInput(entry.occurred_at));
    setEditing(true);
  };

  const saveTraceEdit = async () => {
    setSaving(true);
    try {
      await timeline.updateEntry(entry.id, {
        titre: entry.titre,
        contenu: draftNotes.trim() || null,
        occurred_at: datetimeLocalToUnix(traceOccurredAt),
      });
      toast.success("Trace RDV mise à jour");
      setEditing(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
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

  const saveSuiviRdvReschedule = async () => {
    if (!suiviRdv) return;
    setSuiviSaving(true);
    try {
      const occurredAtUnix = datetimeLocalToUnix(suiviOccurredAt);
      const calendar = await applyPipeSuiviRdvReschedule({
        timeline,
        entry,
        pipe,
        newOccurredAtUnix: occurredAtUnix,
        contenu: suiviContenu.trim() || null,
      });
      toastAfterPipeRdvReschedule(calendar);
      setSuiviRdvRescheduleOpen(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSuiviSaving(false);
    }
  };

  const startSuiviRdvReschedule = () => {
    setSuiviOccurredAt(unixToDatetimeLocalInput(entry.occurred_at));
    setSuiviContenu(entry.contenu ?? "");
    setSuiviRdvRescheduleOpen(true);
  };

  const cancelSuiviRdvReschedule = () => {
    setSuiviRdvRescheduleOpen(false);
    setSuiviOccurredAt("");
    setSuiviContenu("");
  };

  const handleSuiviRdvDelete = () => {
    setRdvOutcomeOpen(true);
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

            {editing && traceNote && !milestone ? (
              <div className="space-y-2">
                <div className="space-y-1">
                  <Label htmlFor={`trace-date-${entry.id}`} className="text-xs">
                    Date
                  </Label>
                  <Input
                    id={`trace-date-${entry.id}`}
                    type="datetime-local"
                    value={traceOccurredAt}
                    onChange={(e) => setTraceOccurredAt(e.target.value)}
                    disabled={saving}
                  />
                </div>
                <DictationTextarea
                  label="Contenu"
                  value={draftNotes}
                  onChange={setDraftNotes}
                  rows={4}
                  placeholder="Motif, contexte, suite à donner…"
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
                    onClick={() => void saveTraceEdit()}
                    disabled={saving}
                  >
                    {saving ? "Enregistrement…" : "Enregistrer"}
                  </Button>
                </div>
              </div>
            ) : editing && prospectionMilestone ? (
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
            ) : editing && milestone ? (
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
                <PipeProspectionMilestoneReadSummary contactId={contactId} />
              </>
            ) : (
              <>
                {displayContenu ? (
                  <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
                    {displayContenu}
                  </p>
                ) : milestone && !hideEmptyMilestoneNote ? (
                  <p className="text-xs text-muted-foreground italic">
                    Aucune note pour cette étape.
                  </p>
                ) : null}
                {suiviRdvRescheduleOpen && suiviRdv ? (
                  <div className="space-y-2 mt-2">
                    <div className="space-y-1">
                      <Label htmlFor={`suivi-rdv-date-${entry.id}`} className="text-xs">
                        Nouvelle date et heure
                      </Label>
                      <Input
                        id={`suivi-rdv-date-${entry.id}`}
                        type="datetime-local"
                        value={suiviOccurredAt}
                        onChange={(e) => setSuiviOccurredAt(e.target.value)}
                        disabled={suiviSaving}
                      />
                    </div>
                    <DictationTextarea
                      label="Détail"
                      value={suiviContenu}
                      onChange={setSuiviContenu}
                      rows={3}
                      placeholder="Compte-rendu, prochaine étape…"
                      disabled={suiviSaving}
                    />
                    <div className="flex justify-end gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={cancelSuiviRdvReschedule}
                        disabled={suiviSaving}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void saveSuiviRdvReschedule()}
                        disabled={suiviSaving}
                      >
                        {suiviSaving ? "Enregistrement…" : "Enregistrer"}
                      </Button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>

          <div className="flex shrink-0 gap-0.5">
            {traceNote && !milestone && !editing && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Modifier la trace RDV"
                onClick={startTraceEdit}
              >
                <Pencil className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
            {activeRdvForTrace && !editing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => setRdvOutcomeOpen(true)}
              >
                Annuler le RDV
              </Button>
            )}
            {canResumeCancelledRdv && !editing && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                onClick={() => setResumeRdvOpen(true)}
              >
                Reprendre RDV
              </Button>
            )}
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
            {onDelete && !editing && !suiviRdv && (
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
            {suiviRdv && !editing && !suiviRdvRescheduleOpen && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                aria-label="Annuler ou reporter le RDV de suivi"
                onClick={handleSuiviRdvDelete}
              >
                <Trash2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            )}
          </div>
        </div>
        {resumeRdvOpen && traceMeta?.kind === "cancelled" ? (
          <div className="mt-3">
            <PipeTimelineResumeRdvForm
              rdvStage={traceMeta.stage}
              pipe={pipe}
              timeline={timeline}
              onCancel={() => setResumeRdvOpen(false)}
              onSuccess={() => setResumeRdvOpen(false)}
            />
          </div>
        ) : null}
      </article>
      {activeRdvForTrace ? (
        <PipeRdvOutcomeDialog
          open={rdvOutcomeOpen}
          entry={activeRdvForTrace}
          pipe={pipe}
          timeline={timeline}
          onClose={() => setRdvOutcomeOpen(false)}
          onReschedule={() => setRdvOutcomeOpen(false)}
        />
      ) : null}
      {suiviRdv ? (
        <PipeRdvOutcomeDialog
          open={rdvOutcomeOpen}
          entry={entry}
          pipe={pipe}
          timeline={timeline}
          onClose={() => setRdvOutcomeOpen(false)}
          onReschedule={() => {
            setRdvOutcomeOpen(false);
            startSuiviRdvReschedule();
          }}
        />
      ) : null}
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
  const [suiviPlacementHints, setSuiviPlacementHints] = useState<SuiviPlacementTimelineHints>(
    () => buildSuiviPlacementTimelineHints([])
  );
  const stageMilestones = getCanonicalStageMilestones(entries, { pipeType: pipe.pipe_type });
  const visibleEntries = getVisiblePipeTimelineEntries(entries, { pipeType: pipe.pipe_type });
  const context = useMemo(
    (): PipeTimelineDisplayContext => ({
      pipeType: pipe.pipe_type,
      timelineEntries: visibleEntries,
      suiviPlacementHints:
        pipe.pipe_type === PIPE_TYPE_SUIVI ? suiviPlacementHints : undefined,
    }),
    [pipe.pipe_type, visibleEntries, suiviPlacementHints]
  );
  const flatDurationLabels = buildFlatTimelineDurationLabels(visibleEntries, context);

  useEffect(() => {
    if (pipe.pipe_type !== PIPE_TYPE_SUIVI) {
      setSuiviPlacementHints(buildSuiviPlacementTimelineHints([]));
      return;
    }
    const reload = async () => {
      try {
        const ops = await listPlacementOperationsForPipe(pipe.id);
        setSuiviPlacementHints(buildSuiviPlacementTimelineHints(ops));
      } catch {
        setSuiviPlacementHints(buildSuiviPlacementTimelineHints([]));
      }
    };
    void reload();
    const onChanged = () => void reload();
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
  }, [pipe.id, pipe.pipe_type]);

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
    if (isRdvTimelineTraceNote(entry)) {
      const trace = parseRdvTimelineTraceNote(entry.contenu);
      const activeRdv =
        trace?.kind === "rescheduled"
          ? listRdvEntriesForStage(entries, trace.stage)[0]
          : undefined;
      toast.error(
        activeRdv
          ? "Utilisez « Annuler le RDV » sur la trace de report."
          : "Cette trace d'historique RDV ne peut pas être supprimée."
      );
      return;
    }
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
                {monthGroup.items.map((entry, index) => {
                  const durationLabel = flatDurationLabels.get(entry.id) ?? null;
                  const isLast = index === monthGroup.items.length - 1;

                  if (isFlatTimelineUserEntry(entry)) {
                    return (
                      <PipeTimelinePhaseEntryRow
                        key={entry.id}
                        variant="timeline"
                        entry={entry}
                        pipe={pipe}
                        timeline={timeline}
                        durationLabel={durationLabel}
                        isLast={isLast}
                        context={context}
                      />
                    );
                  }

                  return (
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
                      flatDurationLabel={durationLabel}
                      isLast={isLast}
                      onSaveMilestoneNotes={
                        isStageMilestoneEntry(entry.entry_type)
                          ? async (contenu) => {
                              await updateMilestoneNotes(entry.id, contenu);
                            }
                          : undefined
                      }
                      onDelete={
                        isPipeTimelineSystemEntry(entry.entry_type) ||
                        isRdvTimelineTraceNote(entry)
                          ? undefined
                          : () => void handleDelete(entry)
                      }
                    />
                  );
                })}
              </ol>
            </div>
          ))}
        </section>
      ))}
    </div>
  );
}

