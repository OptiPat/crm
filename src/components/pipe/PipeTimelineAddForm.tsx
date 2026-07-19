import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import { RdvVisioLocationFields } from "@/components/calendar/RdvVisioLocationFields";
import { PipeAffaireRdvPlanSelect } from "@/components/pipe/PipeAffaireRdvPlanSelect";
import { PipeR1RdvDocumentsFields } from "@/components/pipe/PipeR1RdvDocumentsFields";
import { PipeR3RdvDocumentsFields } from "@/components/pipe/PipeR3RdvDocumentsFields";
import { PipeR3ImmoRdvDocumentsFields } from "@/components/pipe/PipeR3ImmoRdvDocumentsFields";
import { usePipeChecklistTemplates } from "@/hooks/usePipeChecklistTemplates";
import { usePipeR1RdvProfilePlanning } from "@/hooks/usePipeR1RdvProfilePlanning";
import { usePipeR3ImmoRdvPlanning } from "@/hooks/usePipeR3ImmoRdvPlanning";
import type { R1ChecklistProfile } from "@/lib/pipe/pipe-checklist-template";
import type { R3ImmoRdvPlanningDraft } from "@/lib/pipe/pipe-r3-immo-rdv-planning";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { AgendaRdvConflicts } from "@/components/calendar/AgendaRdvConflicts";
import type { AgendaRdvPipeDraft } from "@/lib/navigation/agenda-navigation";
import { syncEndFromStartAndDuration, defaultRdvDurationPresetForPlanOption, rdvDurationMinutesFromPreset } from "@/lib/calendar/rdv-duration";
import { useRdvVisioLocation } from "@/hooks/useRdvVisioLocation";
import type { RdvVisioOptions } from "@/lib/calendar/rdv-visio";
import {
  datetimeLocalToUnix,
  defaultTimelineEntryTitle,
  PIPE_TIMELINE_TYPE_LABELS,
  unixToDatetimeLocalInput,
  type PipeTimelineUserType,
} from "@/lib/pipe/pipe-timeline-types";
import {
  formatRdvPlanOptionLabel,
  isR3ImmoRdvPlanOption,
  isR3PlacementsRdvPlanOption,
  rdvStageFromPlanOption,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import { toast } from "sonner";

export interface PipeRdvSubmitPayload {
  occurredAtUnix: number;
  rdvPlanOption: PipeRdvPlanOption;
  rdvStage: ReturnType<typeof rdvStageFromPlanOption>;
  contenu: string | null;
  visio: RdvVisioOptions;
  physicalAddress: string | null;
  r1Profile?: R1ChecklistProfile;
  r3ImmoDraft?: R3ImmoRdvPlanningDraft;
}

interface PipeTimelineAddFormProps {
  type: PipeTimelineUserType;
  occurredAt: string;
  titre: string;
  contenu: string;
  rdvPlanOption?: PipeRdvPlanOption;
  pipe?:
    | (Pick<PipeRecord, "id" | "stage" | "pipe_type"> &
        Partial<
          Pick<
            PipeRecord,
            | "contact_id"
            | "contact_prenom"
            | "contact_nom"
            | "secondary_contact_id"
            | "titre"
          >
        >)
    | null;
  saving: boolean;
  onOccurredAtChange: (value: string) => void;
  onTitreChange: (value: string) => void;
  onContenuChange: (value: string) => void;
  onRdvPlanOptionChange?: (value: PipeRdvPlanOption) => void;
  /** Type RDV figé (ex. reprise après annulation). */
  rdvPlanOptionReadOnly?: boolean;
  contactId?: number;
  onRdvSubmit?: (payload: PipeRdvSubmitPayload) => Promise<void>;
  /** RDV de suivi : pas d'étape R1/R2/R3, libellés adaptés. */
  suiviRdv?: boolean;
  onCancel: () => void;
  onSubmit: (e: FormEvent) => void;
  submitLabel?: string;
}

export function PipeTimelineAddForm({
  type,
  occurredAt,
  titre,
  contenu,
  rdvPlanOption = "R1",
  pipe = null,
  saving,
  onOccurredAtChange,
  onTitreChange,
  onContenuChange,
  onRdvPlanOptionChange,
  rdvPlanOptionReadOnly = false,
  contactId = 0,
  onRdvSubmit,
  suiviRdv = false,
  onCancel,
  onSubmit,
  submitLabel = "Ajouter",
}: PipeTimelineAddFormProps) {
  const isRdv = type === "RDV";
  const rdvLocation = useRdvVisioLocation(contactId > 0 ? contactId : undefined, isRdv);
  const showAffaireRdvStage = isRdv && !suiviRdv;
  const rdvStage = rdvStageFromPlanOption(rdvPlanOption);
  const primaryContactId = pipe?.contact_id ?? contactId;
  const showR1DocumentsFields =
    showAffaireRdvStage && rdvStage === "R1" && pipe != null && pipe.id > 0;
  const showR3DocumentsFields =
    showAffaireRdvStage &&
    isR3PlacementsRdvPlanOption(rdvPlanOption) &&
    pipe != null &&
    pipe.id > 0;
  const showR3ImmoDocumentsFields =
    showAffaireRdvStage &&
    isR3ImmoRdvPlanOption(rdvPlanOption) &&
    pipe != null &&
    pipe.id > 0;
  const rdvConflictDurationMinutes = rdvDurationMinutesFromPreset(
    defaultRdvDurationPresetForPlanOption(rdvPlanOption)
  );
  const { templates: checklistTemplates } = usePipeChecklistTemplates();
  const { profile: r1Profile, setProfile: setR1Profile, profileReady: r1ProfileReady } =
    usePipeR1RdvProfilePlanning({
    enabled: showR1DocumentsFields,
    pipeId: pipe?.id ?? 0,
    primaryContactId,
  });
  const {
    draft: r3ImmoDraft,
    setDraft: setR3ImmoDraft,
    checklistContext: r3ImmoChecklistContext,
    template: r3ImmoTemplate,
    planningReady: r3ImmoPlanningReady,
    revenueFromR1: r3ImmoRevenueFromR1,
    revenueLabel: r3ImmoRevenueLabel,
  } = usePipeR3ImmoRdvPlanning({
    enabled: showR3ImmoDocumentsFields,
    pipeId: pipe?.id ?? 0,
    primaryContactId,
    secondaryContactId: pipe?.secondary_contact_id,
  });

  const handleFormSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (isRdv && onRdvSubmit && contactId > 0) {
      void (async () => {
        const validationError = rdvLocation.validate();
        if (validationError) {
          toast.error(validationError);
          return;
        }
        if (showR1DocumentsFields && !r1ProfileReady) {
          toast.error("Chargement du profil documents R1 en cours…");
          return;
        }
        if (showR3ImmoDocumentsFields && !r3ImmoPlanningReady) {
          toast.error("Chargement du contexte documents R3 Immo en cours…");
          return;
        }
        try {
          await rdvLocation.persistContactAddress();
          await onRdvSubmit({
            occurredAtUnix: datetimeLocalToUnix(occurredAt),
            rdvPlanOption,
            rdvStage,
            contenu: contenu.trim() || null,
            visio: rdvLocation.getVisioOptions(),
            physicalAddress: rdvLocation.getPhysicalAddress(),
            r1Profile: rdvStage === "R1" ? r1Profile : undefined,
            r3ImmoDraft: isR3ImmoRdvPlanOption(rdvPlanOption) ? r3ImmoDraft : undefined,
          });
        } catch (err) {
          toast.error(String(err));
        }
      })();
      return;
    }
    onSubmit(e);
  };

  return (
    <form onSubmit={handleFormSubmit} className="rounded-lg border bg-muted/20 p-4 space-y-3">
      <p className="text-sm font-medium">
        Nouvelle entrée —{" "}
        {suiviRdv && isRdv ? "RDV de suivi" : PIPE_TIMELINE_TYPE_LABELS[type]}
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Date et heure</Label>
          <Input
            type="datetime-local"
            value={occurredAt}
            onChange={(e) => onOccurredAtChange(e.target.value)}
          />
        </div>
        {showAffaireRdvStage ? (
          <div className="space-y-2">
            <Label>Type de RDV</Label>
            {rdvPlanOptionReadOnly ? (
              <p className="text-sm font-medium pt-2">
                {formatRdvPlanOptionLabel(rdvPlanOption)}
              </p>
            ) : (
              <PipeAffaireRdvPlanSelect
                value={rdvPlanOption}
                onValueChange={(value) => onRdvPlanOptionChange?.(value)}
              />
            )}
          </div>
        ) : !isRdv ? (
          <div className="space-y-2">
            <Label>Titre</Label>
            <Input value={titre} onChange={(e) => onTitreChange(e.target.value)} />
          </div>
        ) : null}
      </div>
      {showAffaireRdvStage && (
        <p className="text-xs text-muted-foreground leading-snug">
          L&apos;affaire passera à l&apos;étape choisie le jour du RDV (ou tout de suite si la date
          est déjà passée).
        </p>
      )}
      {showR1DocumentsFields && (
        <PipeR1RdvDocumentsFields
          profile={r1Profile}
          templates={checklistTemplates}
          onProfileChange={setR1Profile}
          disabled={saving || !r1ProfileReady}
        />
      )}
      {showR3DocumentsFields && (
        <PipeR3RdvDocumentsFields templates={checklistTemplates} disabled={saving} />
      )}
      {showR3ImmoDocumentsFields && (
        <PipeR3ImmoRdvDocumentsFields
          draft={r3ImmoDraft}
          onDraftChange={setR3ImmoDraft}
          checklistContext={r3ImmoChecklistContext}
          template={r3ImmoTemplate}
          revenueFromR1={r3ImmoRevenueFromR1}
          revenueLabel={r3ImmoRevenueLabel}
          disabled={saving || !r3ImmoPlanningReady}
        />
      )}
      {isRdv && contactId > 0 && (
        <RdvVisioLocationFields
          visioMode={rdvLocation.visioMode}
          visioLink={rdvLocation.visioLink}
          address={rdvLocation.address}
          disabled={saving}
          onVisioModeChange={rdvLocation.setVisioMode}
          onVisioLinkChange={rdvLocation.setVisioLink}
          onAddressFieldChange={rdvLocation.setAddressField}
        />
      )}
      {isRdv && (
        <AgendaRdvConflicts
          occurredAt={occurredAt}
          endAt={syncEndFromStartAndDuration(occurredAt, rdvConflictDurationMinutes)}
          pipeDraft={
            pipe && pipe.contact_id != null && pipe.contact_id > 0
              ? {
                  pipe: pipe as AgendaRdvPipeDraft["pipe"],
                  rdvStage,
                  contenu: contenu.trim() || null,
                }
              : null
          }
        />
      )}
      <DictationTextarea
        label="Détail"
        value={contenu}
        onChange={onContenuChange}
        rows={3}
        placeholder="Compte-rendu, prochaine étape…"
      />
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" size="sm" onClick={onCancel}>
          Annuler
        </Button>
        <Button
          type="submit"
          size="sm"
          disabled={
            saving ||
            (showR1DocumentsFields && !r1ProfileReady) ||
            (showR3ImmoDocumentsFields && !r3ImmoPlanningReady)
          }
        >
          {saving ? "Enregistrement…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function createEmptyTimelineAddState(type: PipeTimelineUserType) {
  return {
    type,
    occurredAt: unixToDatetimeLocalInput(),
    titre: defaultTimelineEntryTitle(type),
    contenu: "",
  };
}

export { datetimeLocalToUnix, defaultTimelineEntryTitle };
