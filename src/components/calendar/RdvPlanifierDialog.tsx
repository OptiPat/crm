import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import { AgendaRdvConflicts } from "@/components/calendar/AgendaRdvConflicts";
import { RdvVisioLocationFields } from "@/components/calendar/RdvVisioLocationFields";
import { PipeContactSelect } from "@/components/pipe/PipeContactSelect";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import { listPipes, type PipeRecord } from "@/lib/api/tauri-pipe";
import {
  RDV_DURATION_PRESETS,
  datetimeLocalToUnix,
  defaultRdvDurationPresetForPlanOption,
  rdvDurationMinutesFromPreset,
  syncEndFromStartAndDuration,
  unixToDatetimeLocalInput,
  type RdvDurationPresetId,
} from "@/lib/calendar/rdv-duration";
import { findNextFreeSlot, loadGoogleEventsForHorizon } from "@/lib/calendar/agenda-free-slot";
import {
  planifyPipeRdv,
  planifyPipeSuiviRdv,
  planifyStandaloneGoogleRdv,
} from "@/lib/calendar/rdv-planifier";
import { useRdvVisioLocation } from "@/hooks/useRdvVisioLocation";
import { PipeAffaireRdvPlanSelect } from "@/components/pipe/PipeAffaireRdvPlanSelect";
import { usePipeR1RdvProfilePlanning } from "@/hooks/usePipeR1RdvProfilePlanning";
import { PipeR1RdvDocumentsFields } from "@/components/pipe/PipeR1RdvDocumentsFields";
import { PipeR3RdvDocumentsFields } from "@/components/pipe/PipeR3RdvDocumentsFields";
import { PipeR3ImmoRdvDocumentsFields } from "@/components/pipe/PipeR3ImmoRdvDocumentsFields";
import { usePipeChecklistTemplates } from "@/hooks/usePipeChecklistTemplates";
import { usePipeR3ImmoRdvPlanning } from "@/hooks/usePipeR3ImmoRdvPlanning";
import {
  defaultPlanOptionForRdvStage,
  formatRdvPlanOptionLabel,
  isR3ImmoRdvPlanOption,
  isR3PlacementsRdvPlanOption,
  rdvStageFromPlanOption,
  type PipeRdvPlanOption,
} from "@/lib/pipe/pipe-rdv-plan-option";
import type { PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { isPipeType } from "@/lib/pipe/pipe-types";
import {
  formatPipeRdvCalendarContactLabel,
  formatPipeRdvGoogleCalendarTitleFromPlanOption,
} from "@/lib/pipe/pipe-rdv-google-calendar";
import { toastPipeRdvOutcome, toastAfterSuiviRdvSave } from "@/lib/pipe/pipe-rdv-entry-actions";
import {
  saveR1ChecklistProfileForPipe,
} from "@/lib/pipe/pipe-r1-checklist-email-vars";
import { saveR3ImmoChecklistContextForPipe } from "@/lib/pipe/pipe-r3-immo-rdv-planning";
import {
  formatPipeSuiviRdvGoogleCalendarTitle,
  isSuiviPipe,
} from "@/lib/pipe/pipe-suivi";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import { toast } from "sonner";

export type RdvPlanifierContext =
  | { kind: "agenda" }
  | {
      kind: "linked";
      contactId: number;
      contactLabel: string;
      alerteId?: number | null;
      tacheId?: number | null;
      defaultTitle?: string;
    }
  | {
      kind: "pipe";
      pipe: Pick<
        PipeRecord,
        | "id"
        | "stage"
        | "pipe_type"
        | "contact_id"
        | "contact_prenom"
        | "contact_nom"
        | "secondary_contact_id"
        | "secondary_contact_prenom"
        | "secondary_contact_nom"
        | "titre"
      >;
      rdvStage?: PipeRdvStage;
      rdvPlanOption?: PipeRdvPlanOption;
      contenu?: string | null;
    };

interface RdvPlanifierDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  context: RdvPlanifierContext;
  defaultStartUnix?: number;
  defaultEndUnix?: number;
  onCreated?: () => void;
}

function defaultStartValue(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return unixToDatetimeLocalInput(Math.floor(d.getTime() / 1000));
}

function RdvPlanifierSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <section className="space-y-3 rounded-lg border border-border/60 bg-muted/15 p-3.5">
      <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

export function RdvPlanifierDialog({
  open,
  onOpenChange,
  context,
  defaultStartUnix,
  defaultEndUnix,
  onCreated,
}: RdvPlanifierDialogProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [pipes, setPipes] = useState<PipeRecord[]>([]);
  const [contactId, setContactId] = useState(0);
  const [pipeId, setPipeId] = useState<number | null>(null);
  const [rdvPlanOption, setRdvPlanOption] = useState<PipeRdvPlanOption>("R1");
  const rdvStage = rdvStageFromPlanOption(rdvPlanOption);
  const [durationPreset, setDurationPreset] = useState<RdvDurationPresetId>("60");
  const [start, setStart] = useState(defaultStartValue());
  const [end, setEnd] = useState("");
  const [title, setTitle] = useState("");
  const [titleEdited, setTitleEdited] = useState(false);
  const [contenu, setContenu] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const { templates: checklistTemplates } = usePipeChecklistTemplates();

  const effectiveContactId =
    context.kind === "linked"
      ? context.contactId
      : context.kind === "pipe"
        ? context.pipe.contact_id
        : contactId;

  const rdvLocation = useRdvVisioLocation(
    effectiveContactId > 0 ? effectiveContactId : undefined,
    open
  );
  const { reset: resetRdvLocation } = rdvLocation;

  const fixedContact =
    context.kind === "linked"
      ? { id: context.contactId, label: context.contactLabel }
      : context.kind === "pipe"
        ? {
            id: context.pipe.contact_id,
            label: formatPipeRdvCalendarContactLabel(context.pipe),
          }
        : null;

  useEffect(() => {
    if (!open) return;
    void getAllContacts().then(setContacts);
    void listPipes().then(setPipes);
    return subscribeContactsChanged(() => {
      void getAllContacts().then(setContacts);
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const startVal =
      defaultStartUnix != null
        ? unixToDatetimeLocalInput(defaultStartUnix)
        : defaultStartValue();
    const initialPlanOption =
      context.kind === "pipe"
        ? (context.rdvPlanOption ??
            (context.rdvStage ? defaultPlanOptionForRdvStage(context.rdvStage) : "R1"))
        : "R1";
    const preset = defaultRdvDurationPresetForPlanOption(initialPlanOption);
    setDurationPreset(preset);
    setStart(startVal);
    setEnd(
      defaultEndUnix != null
        ? unixToDatetimeLocalInput(defaultEndUnix)
        : syncEndFromStartAndDuration(startVal, rdvDurationMinutesFromPreset(preset))
    );
    setRdvPlanOption(initialPlanOption);
    setContenu(context.kind === "pipe" ? (context.contenu ?? "") : "");
    setTitleEdited(false);
    void resetRdvLocation();
    if (context.kind === "pipe") {
      setContactId(context.pipe.contact_id);
      setPipeId(context.pipe.id);
      setTitle("");
    } else if (context.kind === "linked") {
      setContactId(context.contactId);
      setPipeId(null);
      setTitle(context.defaultTitle ?? `RDV — ${context.contactLabel}`);
    } else {
      setContactId(0);
      setPipeId(null);
      setTitle("");
    }
  }, [open, context, defaultStartUnix, defaultEndUnix, resetRdvLocation]);

  const contactAffaires = useMemo(
    () =>
      pipes.filter(
        (p) =>
          (p.contact_id === contactId || p.secondary_contact_id === contactId) &&
          isPipeType(p.pipe_type) &&
          p.pipe_type === "AFFAIRE"
      ),
    [pipes, contactId]
  );

  const selectedContact = contacts.find((c) => c.id === contactId);
  const contactLabel =
    fixedContact?.label ??
    (selectedContact
      ? `${selectedContact.nom} ${selectedContact.prenom}`.trim()
      : "");

  const selectedPipe =
    pipeId != null ? pipes.find((p) => p.id === pipeId) ?? null : null;

  const pipeForPlanify = useMemo(() => {
    if (context.kind === "pipe") {
      return pipes.find((p) => p.id === context.pipe.id) ?? context.pipe;
    }
    return selectedPipe && isPipeType(selectedPipe.pipe_type) ? selectedPipe : null;
  }, [context, pipes, selectedPipe]);

  const isSuiviPipeContext = pipeForPlanify != null && isSuiviPipe(pipeForPlanify);
  const showR1DocumentsFields =
    pipeForPlanify != null && !isSuiviPipeContext && rdvStage === "R1";
  const showR3DocumentsFields =
    pipeForPlanify != null &&
    !isSuiviPipeContext &&
    isR3PlacementsRdvPlanOption(rdvPlanOption);
  const showR3ImmoDocumentsFields =
    pipeForPlanify != null &&
    !isSuiviPipeContext &&
    isR3ImmoRdvPlanOption(rdvPlanOption);

  const primaryContactId = pipeForPlanify?.contact_id ?? effectiveContactId;
  const { profile: r1Profile, setProfile: setR1Profile, profileReady: r1ProfileReady } =
    usePipeR1RdvProfilePlanning({
    enabled: open && showR1DocumentsFields,
    pipeId: pipeForPlanify?.id ?? 0,
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
    enabled: open && showR3ImmoDocumentsFields,
    pipeId: pipeForPlanify?.id ?? 0,
    primaryContactId,
    secondaryContactId: pipeForPlanify?.secondary_contact_id,
  });

  const pipeContactLabel = pipeForPlanify
    ? formatPipeRdvCalendarContactLabel(pipeForPlanify)
    : contactLabel;

  useEffect(() => {
    if (!open || titleEdited || !pipeForPlanify || !pipeContactLabel) return;
    if (isSuiviPipeContext) {
      setTitle(formatPipeSuiviRdvGoogleCalendarTitle(pipeContactLabel));
      return;
    }
    setTitle(formatPipeRdvGoogleCalendarTitleFromPlanOption(rdvPlanOption, pipeContactLabel));
  }, [open, pipeForPlanify, rdvPlanOption, pipeContactLabel, titleEdited, isSuiviPipeContext]);

  const handlePlanOptionChange = (value: PipeRdvPlanOption) => {
    setRdvPlanOption(value);
    const preset = defaultRdvDurationPresetForPlanOption(value);
    setDurationPreset(preset);
    setEnd(syncEndFromStartAndDuration(start, rdvDurationMinutesFromPreset(preset)));
  };

  const handleStartChange = (value: string) => {
    setStart(value);
    setEnd(syncEndFromStartAndDuration(value, rdvDurationMinutesFromPreset(durationPreset)));
  };

  const handleDurationChange = (presetId: RdvDurationPresetId) => {
    setDurationPreset(presetId);
    setEnd(syncEndFromStartAndDuration(start, rdvDurationMinutesFromPreset(presetId)));
  };

  const suggestNextSlot = async () => {
    const fromUnix = datetimeLocalToUnix(start) || Math.floor(Date.now() / 1000);
    try {
      const events = await loadGoogleEventsForHorizon(fromUnix, 5);
      const durationSec = rdvDurationMinutesFromPreset(durationPreset) * 60;
      const slot = findNextFreeSlot(events, {
        durationSec,
        fromUnix,
      });
      if (!slot) {
        toast.message("Aucun créneau libre trouvé sur les 5 prochains jours ouvrés.");
        return;
      }
      const startVal = unixToDatetimeLocalInput(slot.startAt);
      setStart(startVal);
      setEnd(unixToDatetimeLocalInput(slot.endAt));
      toast.success("Prochain créneau libre proposé");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Impossible de chercher un créneau");
    }
  };

  const handleSubmit = async () => {
    if (!start || !end) return;
    const startAt = datetimeLocalToUnix(start);
    const endAt = datetimeLocalToUnix(end);
    if (endAt <= startAt) {
      toast.error("L'heure de fin doit être après le début.");
      return;
    }
    if (effectiveContactId <= 0) {
      toast.error("Choisissez un contact.");
      return;
    }
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

    const visio = rdvLocation.getVisioOptions();
    const physicalAddress = rdvLocation.getPhysicalAddress();

    setSubmitting(true);
    try {
      await rdvLocation.persistContactAddress();
      if (isSuiviPipeContext && pipeForPlanify) {
        const result = await planifyPipeSuiviRdv({
          pipe: pipeForPlanify,
          startAtUnix: startAt,
          endAtUnix: endAt,
          contenu: contenu.trim() || null,
          visio,
          physicalAddress,
          calendarTitle: title.trim() || null,
        });
        toastAfterSuiviRdvSave(result.calendar);
      } else if (pipeForPlanify) {
        if (rdvStage === "R1") {
          await saveR1ChecklistProfileForPipe(pipeForPlanify.id, r1Profile);
        }
        if (isR3ImmoRdvPlanOption(rdvPlanOption)) {
          await saveR3ImmoChecklistContextForPipe(pipeForPlanify.id, r3ImmoDraft);
        }
        const result = await planifyPipeRdv({
          pipe: pipeForPlanify,
          rdvStage,
          rdvPlanOption,
          startAtUnix: startAt,
          endAtUnix: endAt,
          contenu: contenu.trim() || null,
          visio,
          physicalAddress,
          calendarTitle: title.trim() || null,
        });
        toastPipeRdvOutcome(
          "RDV enregistré dans le Pipe.",
          result.calendar,
          result.calendar && !result.calendar.synced ? "warning" : "success"
        );
      } else {
        await planifyStandaloneGoogleRdv({
          contactId: effectiveContactId,
          contactLabel,
          title: title.trim() || `RDV — ${contactLabel}`,
          startAtUnix: startAt,
          endAtUnix: endAt,
          alerteId: context.kind === "linked" ? context.alerteId : null,
          tacheId: context.kind === "linked" ? context.tacheId : null,
          visio,
          physicalAddress,
        });
        toast.success("RDV planifié dans Google Agenda");
      }
      onOpenChange(false);
      onCreated?.();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erreur planification RDV");
    } finally {
      setSubmitting(false);
    }
  };

  const agendaPipeDraft = useMemo(() => {
    if (context.kind !== "pipe") return null;
    return {
      pipe: context.pipe,
      rdvStage: context.rdvStage ?? rdvStage,
      contenu: contenu.trim() || null,
    };
  }, [context, rdvStage, contenu]);

  const showPipeLink = context.kind === "agenda" || context.kind === "linked";
  const showContactPick = context.kind === "agenda";
  const showDocumentsSection =
    showR1DocumentsFields || showR3DocumentsFields || showR3ImmoDocumentsFields;

  const submitButtonLabel = submitting
    ? "Enregistrement…"
    : isSuiviPipeContext
      ? "Planifier le RDV de suivi"
      : pipeForPlanify && !isSuiviPipeContext
        ? `Planifier le ${formatRdvPlanOptionLabel(rdvPlanOption)}`
        : "Planifier le RDV";

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="flex max-h-[90vh] w-[min(96vw,48rem)] max-w-[min(96vw,48rem)] flex-col overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>
            {isSuiviPipeContext ? "Planifier un RDV de suivi" : "Planifier un RDV"}
          </DialogTitle>
          <DialogDescription>
            {isSuiviPipeContext && pipeForPlanify
              ? `Suivi « ${pipeForPlanify.titre} » — enregistré sur l'affaire, synchronisé avec Google Agenda si connecté.`
              : pipeForPlanify
                ? `Affaire « ${pipeForPlanify.titre} » — enregistré sur l'affaire, synchronisé avec Google Agenda si connecté.`
                : "Synchronisé avec Google Agenda si connecté. Liez une affaire pour le suivi commercial."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-1">
          <RdvPlanifierSection title="Qui et quoi">
            {showContactPick ? (
              <PipeContactSelect
                contacts={contacts}
                value={contactId}
                onChange={(id) => {
                  setContactId(id);
                  setPipeId(null);
                }}
                onContactCreated={(c) => {
                  setContacts((prev) => [...prev, c]);
                }}
                disabled={submitting}
              />
            ) : (
              <div className="space-y-1">
                <Label>Contact</Label>
                <p className="text-sm font-medium">{contactLabel}</p>
              </div>
            )}

            {showPipeLink && contactId > 0 ? (
              <div className="space-y-2">
                <Label>Affaire Pipe (optionnel)</Label>
                <Select
                  value={pipeId != null ? String(pipeId) : "__none__"}
                  onValueChange={(v) => setPipeId(v === "__none__" ? null : Number(v))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Sans affaire Pipe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">Sans affaire Pipe (Agenda seul)</SelectItem>
                    {contactAffaires.map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.titre}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : null}

            {pipeForPlanify && !isSuiviPipeContext ? (
              <div className="space-y-2">
                <Label>Type de RDV</Label>
                <PipeAffaireRdvPlanSelect
                  value={rdvPlanOption}
                  onValueChange={handlePlanOptionChange}
                />
              </div>
            ) : null}
          </RdvPlanifierSection>

          {showDocumentsSection ? (
            <RdvPlanifierSection title="Documents du mail">
              {showR1DocumentsFields ? (
                <PipeR1RdvDocumentsFields
                  profile={r1Profile}
                  templates={checklistTemplates}
                  onProfileChange={setR1Profile}
                  disabled={submitting || !r1ProfileReady}
                />
              ) : null}

              {showR3DocumentsFields ? (
                <PipeR3RdvDocumentsFields templates={checklistTemplates} disabled={submitting} />
              ) : null}

              {showR3ImmoDocumentsFields ? (
                <PipeR3ImmoRdvDocumentsFields
                  draft={r3ImmoDraft}
                  onDraftChange={setR3ImmoDraft}
                  checklistContext={r3ImmoChecklistContext}
                  template={r3ImmoTemplate}
                  revenueFromR1={r3ImmoRevenueFromR1}
                  revenueLabel={r3ImmoRevenueLabel}
                  disabled={submitting || !r3ImmoPlanningReady}
                />
              ) : null}
            </RdvPlanifierSection>
          ) : null}

          <RdvPlanifierSection title="Créneau et lieu">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label htmlFor="rdv-plan-start">Début</Label>
                <Input
                  id="rdv-plan-start"
                  type="datetime-local"
                  value={start}
                  onChange={(e) => handleStartChange(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label>Durée</Label>
                <Select
                  value={durationPreset}
                  onValueChange={(v) => handleDurationChange(v as RdvDurationPresetId)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {RDV_DURATION_PRESETS.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="rdv-plan-end">Fin</Label>
              <Input
                id="rdv-plan-end"
                type="datetime-local"
                value={end}
                onChange={(e) => setEnd(e.target.value)}
              />
            </div>

            <div className="flex justify-end -mt-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs"
                onClick={() => void suggestNextSlot()}
              >
                Prochain créneau libre
              </Button>
            </div>

            <div className="space-y-1">
              <Label htmlFor="rdv-plan-title">Titre agenda</Label>
              <Input
                id="rdv-plan-title"
                value={title}
                onChange={(e) => {
                  setTitleEdited(true);
                  setTitle(e.target.value);
                }}
                placeholder={
                  isSuiviPipeContext && pipeContactLabel
                    ? formatPipeSuiviRdvGoogleCalendarTitle(pipeContactLabel)
                    : pipeForPlanify && pipeContactLabel
                      ? formatPipeRdvGoogleCalendarTitleFromPlanOption(
                          rdvPlanOption,
                          pipeContactLabel
                        )
                      : `RDV — ${contactLabel || "…"}`
                }
              />
            </div>

            <RdvVisioLocationFields
              visioMode={rdvLocation.visioMode}
              visioLink={rdvLocation.visioLink}
              address={rdvLocation.address}
              disabled={submitting}
              onVisioModeChange={rdvLocation.setVisioMode}
              onVisioLinkChange={rdvLocation.setVisioLink}
              onAddressFieldChange={rdvLocation.setAddressField}
            />

            {pipeForPlanify ? (
              <DictationTextarea
                label="Détail"
                value={contenu}
                onChange={setContenu}
                rows={2}
                placeholder="Compte-rendu, contexte…"
              />
            ) : null}

            <AgendaRdvConflicts occurredAt={start} endAt={end} pipeDraft={agendaPipeDraft} />
          </RdvPlanifierSection>
        </div>

        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            disabled={
              submitting ||
              (showR1DocumentsFields && !r1ProfileReady) ||
              (showR3ImmoDocumentsFields && !r3ImmoPlanningReady)
            }
            onClick={() => void handleSubmit()}
          >
            {submitButtonLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
