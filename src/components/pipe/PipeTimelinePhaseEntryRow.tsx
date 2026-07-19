import { useState } from "react";
import { Calendar, FileText, Pencil, Phone, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  datetimeLocalToUnix,
  PipeTimelineAddForm,
} from "@/components/pipe/PipeTimelineAddForm";
import { PipeRdvTypifyMenu } from "@/components/pipe/PipeRdvTypifyMenu";
import { PipeRdvOutcomeDialog } from "@/components/pipe/PipeRdvOutcomeDialog";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { toastAfterRdvSave, toastAfterPipeRdvReschedule } from "@/lib/pipe/pipe-rdv-entry-actions";
import { syncGoogleCalendarForPipeRdv } from "@/lib/calendar/rdv-planifier";
import { resolvePipeRdvGoogleEventId } from "@/lib/api/tauri-calendar";
import { buildPipeRdvCalendarContext } from "@/lib/pipe/pipe-rdv-calendar-context";
import {
  formatPipeRdvCalendarContactLabel,
  resolvePipeRdvCalendarEndAtForTimelineEntry,
} from "@/lib/pipe/pipe-rdv-google-calendar";
import {
  applyPipeRdvReschedule,
  applyPipeSuiviRdvReschedule,
} from "@/lib/pipe/pipe-rdv-reschedule-actions";
import { isRdvTimelineTraceNote } from "@/lib/pipe/pipe-rdv-delete";
import { isSuiviRdvEntry, formatSuiviRdvDisplayLabel } from "@/lib/pipe/pipe-suivi";
import {
  formatTimelineEntryBadgeLabel,
  formatTimelineEntryTitre,
  getPipeTimelineEntryStyle,
  type PipeTimelineDisplayContext,
} from "@/lib/pipe/pipe-timeline-display";
import {
  formatRdvPlanOptionLabel,
  isTypifiableR2Entry,
  isTypifiableR3Entry,
  R2_TYPIFY_TARGETS,
  R3_TYPIFY_TARGETS,
  rdvEntryTitreFromPlanOption,
  rdvPlanOptionFromEntryTitre,
  rdvStageFromPlanOption,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import {
  applyRdvStageOnSave,
  formatRdvEntryDisplayLabel,
  type PipeRdvStage,
} from "@/lib/pipe/pipe-rdv-stage";
import {
  formatTimelineOccurredAt,
  PIPE_TIMELINE_TYPE_LABELS,
  unixToDatetimeLocalInput,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const TYPE_ICONS = {
  APPEL: Phone,
  RDV: Calendar,
  NOTE: FileText,
  PROPOSITION: Send,
} as const;

interface PipeTimelinePhaseEntryRowProps {
  entry: PipeTimelineEntryRecord;
  pipe?:
    | (Pick<PipeRecord, "id" | "stage" | "pipe_type"> &
        Partial<
          Pick<
            PipeRecord,
            | "contact_id"
            | "contact_prenom"
            | "contact_nom"
            | "secondary_contact_id"
            | "secondary_contact_prenom"
            | "secondary_contact_nom"
            | "titre"
          >
        >)
    | null;
  timeline: ReturnType<typeof usePipeTimeline>;
  disabled?: boolean;
  /** nested = sous-jalon (éditeur prospection) ; timeline = point chronologique autonome */
  variant?: "nested" | "timeline";
  durationLabel?: string | null;
  isLast?: boolean;
  context?: PipeTimelineDisplayContext;
}

export function PipeTimelinePhaseEntryRow({
  entry,
  pipe,
  timeline,
  disabled = false,
  variant = "nested",
  durationLabel = null,
  isLast = true,
  context,
}: PipeTimelinePhaseEntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [rdvOutcomeOpen, setRdvOutcomeOpen] = useState(false);
  const [occurredAt, setOccurredAt] = useState(() => unixToDatetimeLocalInput(entry.occurred_at));
  const [titre, setTitre] = useState(entry.titre ?? "");
  const [contenu, setContenu] = useState(entry.contenu ?? "");
  const [rdvPlanOption, setRdvPlanOption] = useState<PipeRdvPlanOption>(
    () => rdvPlanOptionFromEntryTitre(entry.titre) ?? "R1"
  );
  const rdvStage: PipeRdvStage = rdvStageFromPlanOption(rdvPlanOption);
  const [saving, setSaving] = useState(false);

  const liveEntry = timeline.entries.find((e) => e.id === entry.id) ?? entry;
  const userType = liveEntry.entry_type as PipeTimelineUserType;
  const Icon =
    entry.entry_type in TYPE_ICONS
      ? TYPE_ICONS[entry.entry_type as keyof typeof TYPE_ICONS]
      : null;
  const typeLabel =
    variant === "timeline"
      ? formatTimelineEntryBadgeLabel(entry, context)
      : entry.entry_type === "RDV"
        ? isSuiviRdvEntry(entry)
          ? formatSuiviRdvDisplayLabel()
          : (formatRdvEntryDisplayLabel(entry) ?? "RDV")
        : (PIPE_TIMELINE_TYPE_LABELS[userType] ?? entry.entry_type);
  const displayTitre =
    variant === "timeline"
      ? formatTimelineEntryTitre(entry)
      : entry.entry_type !== "RDV" && entry.titre?.trim()
        ? entry.titre.trim()
        : null;
  const timelineStyle =
    variant === "timeline" ? getPipeTimelineEntryStyle(entry, context) : null;

  const startEdit = () => {
    setOccurredAt(unixToDatetimeLocalInput(entry.occurred_at));
    setTitre(entry.titre ?? "");
    setContenu(entry.contenu ?? "");
    setRdvPlanOption(rdvPlanOptionFromEntryTitre(entry.titre) ?? "R1");
    setEditing(true);
  };

  const cancelEdit = () => setEditing(false);

  const saveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const occurredAtUnix = datetimeLocalToUnix(occurredAt);
      const suiviRdv = userType === "RDV" && isSuiviRdvEntry(entry);

      if (suiviRdv && pipe?.contact_id != null && pipe.contact_id > 0) {
        if (occurredAtUnix !== entry.occurred_at) {
          const calendar = await applyPipeSuiviRdvReschedule({
            timeline,
            entry,
            pipe: {
              id: pipe.id,
              stage: pipe.stage,
              pipe_type: pipe.pipe_type,
              contact_id: pipe.contact_id,
              contact_prenom: pipe.contact_prenom ?? "",
              contact_nom: pipe.contact_nom ?? "",
              secondary_contact_id: pipe.secondary_contact_id,
              secondary_contact_prenom: pipe.secondary_contact_prenom,
              secondary_contact_nom: pipe.secondary_contact_nom,
              titre: pipe.titre,
            },
            newOccurredAtUnix: occurredAtUnix,
            contenu: contenu.trim() || null,
          });
          toastAfterPipeRdvReschedule(calendar);
        } else {
          await timeline.updateEntry(entry.id, {
            titre: entry.titre,
            contenu: contenu.trim() || null,
            occurred_at: occurredAtUnix,
          });
          toast.success("Entrée mise à jour");
        }
        setEditing(false);
        return;
      }

      const nextTitre =
        userType === "RDV" ? rdvEntryTitreFromPlanOption(rdvPlanOption) : titre.trim() || null;

      if (
        userType === "RDV" &&
        pipe?.contact_id != null &&
        pipe.contact_id > 0 &&
        occurredAtUnix !== entry.occurred_at
      ) {
        const calendar = await applyPipeRdvReschedule({
          timeline,
          entry,
          pipe: {
            id: pipe.id,
            stage: pipe.stage,
            pipe_type: pipe.pipe_type,
            contact_id: pipe.contact_id,
            contact_prenom: pipe.contact_prenom ?? "",
            contact_nom: pipe.contact_nom ?? "",
            secondary_contact_id: pipe.secondary_contact_id,
            secondary_contact_prenom: pipe.secondary_contact_prenom,
            secondary_contact_nom: pipe.secondary_contact_nom,
            titre: pipe.titre,
          },
          rdvStage,
          rdvPlanOption,
          timelineEntryTitre: nextTitre,
          newOccurredAtUnix: occurredAtUnix,
          contenu: contenu.trim() || null,
        });
        toastAfterPipeRdvReschedule(calendar);
        setEditing(false);
        return;
      }

      await timeline.updateEntry(entry.id, {
        titre: nextTitre,
        contenu: contenu.trim() || null,
        occurred_at: occurredAtUnix,
      });

      if (userType === "RDV" && pipe) {
        const result = await applyRdvStageOnSave({
          pipe,
          rdvStage,
          occurredAt: occurredAtUnix,
          notes: contenu.trim() || null,
        });
        toastAfterRdvSave(rdvStage, result, "Entrée mise à jour");
      } else {
        toast.success("Entrée mise à jour");
      }
      setEditing(false);
    } catch (err) {
      toast.error(String(err));
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (entry.entry_type === "RDV") {
      setRdvOutcomeOpen(true);
      return;
    }
    if (isRdvTimelineTraceNote(entry)) {
      toast.error("Cette trace d'historique RDV ne peut pas être supprimée.");
      return;
    }
    try {
      await timeline.removeEntry(entry.id);
      toast.success("Entrée supprimée");
    } catch (err) {
      toast.error(String(err));
    }
  };

  const handleTypify = async (target: PipeRdvPlanOption) => {
    try {
      const newTitre = rdvEntryTitreFromPlanOption(target);
      await timeline.updateEntry(entry.id, { titre: newTitre });

      if (pipe?.contact_id != null && pipe.contact_id > 0) {
        const calendarPipe = {
          contact_id: pipe.contact_id,
          contact_prenom: pipe.contact_prenom,
          contact_nom: pipe.contact_nom,
          secondary_contact_id: pipe.secondary_contact_id,
          secondary_contact_prenom: pipe.secondary_contact_prenom,
          secondary_contact_nom: pipe.secondary_contact_nom,
        };
        const calendarCtx = buildPipeRdvCalendarContext(calendarPipe);
        const endAtUnix = await resolvePipeRdvCalendarEndAtForTimelineEntry({
          startAtUnix: entry.occurred_at,
          pipeTimelineEntryId: entry.id,
          planOption: target,
        });
        await syncGoogleCalendarForPipeRdv({
          contactId: pipe.contact_id,
          contactLabel: formatPipeRdvCalendarContactLabel(calendarPipe),
          rdvStage: rdvStageFromPlanOption(target),
          rdvPlanOption: target,
          startAtUnix: entry.occurred_at,
          endAtUnix,
          pipeTimelineEntryId: entry.id,
          existingGoogleEventId:
            entry.google_event_id?.trim() ||
            (await resolvePipeRdvGoogleEventId(entry.id)),
          additionalAttendeeContactIds: calendarCtx?.additionalAttendeeContactIds,
        });
      }

      toast.success(`RDV typifié : ${formatRdvPlanOptionLabel(target)}`);
    } catch (err) {
      toast.error(String(err));
    }
  };

  const actionButtons = (
    <div className="flex shrink-0 items-center gap-0.5">
      {!editing && isTypifiableR2Entry(liveEntry) && (
        <PipeRdvTypifyMenu
          disabled={disabled}
          stageLabel="R2"
          targets={R2_TYPIFY_TARGETS}
          onTypify={handleTypify}
        />
      )}
      {!editing && isTypifiableR3Entry(liveEntry) && (
        <PipeRdvTypifyMenu
          disabled={disabled}
          stageLabel="R3"
          targets={R3_TYPIFY_TARGETS}
          onTypify={handleTypify}
        />
      )}
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={variant === "timeline" ? "h-8 w-8" : "h-7 w-7"}
        aria-label="Modifier"
        onClick={startEdit}
        disabled={disabled}
      >
        <Pencil
          className={cn(
            "text-muted-foreground",
            variant === "timeline" ? "h-4 w-4" : "h-3.5 w-3.5"
          )}
        />
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={variant === "timeline" ? "h-8 w-8" : "h-7 w-7"}
        aria-label="Supprimer"
        onClick={() => void handleDelete()}
        disabled={disabled || isRdvTimelineTraceNote(entry)}
      >
        <Trash2
          className={cn(
            "text-muted-foreground",
            variant === "timeline" ? "h-4 w-4" : "h-3.5 w-3.5"
          )}
        />
      </Button>
    </div>
  );

  const entryContent = (
    <div className="flex items-start justify-between gap-2">
      <div className="min-w-0 flex-1 space-y-0.5">
        <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {Icon && <Icon className="h-3 w-3 shrink-0" />}
          <span className={variant === "timeline" ? "font-normal" : "font-medium text-foreground/80"}>
            {typeLabel}
          </span>
          <time>{formatTimelineOccurredAt(entry.occurred_at)}</time>
        </div>
        {displayTitre && (
          <p className="text-sm font-medium leading-snug">{displayTitre}</p>
        )}
        {entry.contenu?.trim() && (
          <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
            {entry.contenu.trim()}
          </p>
        )}
      </div>
      {actionButtons}
    </div>
  );

  const editForm = (
    <PipeTimelineAddForm
      type={userType}
      occurredAt={occurredAt}
      titre={titre}
      contenu={contenu}
      rdvPlanOption={rdvPlanOption}
      pipe={pipe}
      saving={saving}
      onOccurredAtChange={setOccurredAt}
      onTitreChange={setTitre}
      onContenuChange={setContenu}
      onRdvPlanOptionChange={setRdvPlanOption}
      onCancel={cancelEdit}
      onSubmit={(e) => void saveEdit(e)}
      submitLabel="Enregistrer"
    />
  );

  const rdvDialog =
    liveEntry.entry_type === "RDV" ? (
      <PipeRdvOutcomeDialog
        open={rdvOutcomeOpen}
        entry={liveEntry}
        pipe={pipe}
        timeline={timeline}
        onClose={() => setRdvOutcomeOpen(false)}
        onReschedule={() => {
          setRdvOutcomeOpen(false);
          startEdit();
        }}
      />
    ) : null;

  if (variant === "timeline" && timelineStyle) {
    return (
      <>
        <li className={cn("relative pl-6", !isLast && "pb-6")}>
          {!isLast && (
            <span className="absolute left-[0.4375rem] top-3 bottom-0 w-px bg-border" aria-hidden />
          )}
          <span
            className={cn(
              "absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full ring-4 ring-background",
              timelineStyle.dot
            )}
            aria-hidden
          />
          <article className={cn("rounded-lg border p-3 shadow-sm", timelineStyle.card)}>
            {durationLabel ? (
              <p className="mb-2 text-[11px] font-medium text-muted-foreground">{durationLabel}</p>
            ) : null}
            {editing ? editForm : entryContent}
          </article>
        </li>
        {rdvDialog}
      </>
    );
  }

  if (editing) {
    return <li className="list-none">{editForm}</li>;
  }

  return (
    <>
      <li className="flex items-start justify-between gap-2 rounded-md border bg-background/60 px-3 py-2">
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            {Icon && <Icon className="h-3 w-3 shrink-0" />}
            <span className="font-medium text-foreground/80">{typeLabel}</span>
            <time>{formatTimelineOccurredAt(entry.occurred_at)}</time>
          </div>
          {entry.entry_type !== "RDV" && entry.titre?.trim() && (
            <p className="text-sm font-medium leading-snug">{entry.titre.trim()}</p>
          )}
          {entry.contenu?.trim() && (
            <p className="text-sm text-foreground/90 whitespace-pre-wrap leading-relaxed">
              {entry.contenu.trim()}
            </p>
          )}
        </div>
        {actionButtons}
      </li>
      {rdvDialog}
    </>
  );
}
