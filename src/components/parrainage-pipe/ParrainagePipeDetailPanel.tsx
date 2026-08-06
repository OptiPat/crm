import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  deleteParrainagePipe,
  listParrainagePipeTimelineEntries,
  setParrainagePipeStage,
  updateParrainagePipe,
  type ParrainagePipeRecord,
  type ParrainagePipeTimelineEntry,
} from "@/lib/api/tauri-parrainage-pipe";
import {
  displaySmsAnticipationSentNote,
  smsAnticipationProfileFromSentNote,
  smsAnticipationProfileLabelFromSentNote,
} from "@/lib/parrainage-coach/sms-anticipation-templates";
import {
  formatParrainageContactLabel,
  PARRAINAGE_INVITATION_LABELS,
  PARRAINAGE_INVITATION_TYPES,
  PARRAINAGE_PIPE_STAGE_LABELS,
  PARRAINAGE_PIPE_STAGES,
  type ParrainageInvitationType,
  type ParrainagePipeStage,
} from "@/lib/parrainage-pipe/parrainage-pipe-types";
import { ParrainageScriptPanel } from "@/components/parrainage-pipe/ParrainageScriptPanel";
import { toast } from "sonner";

interface ParrainagePipeDetailPanelProps {
  pipe: ParrainagePipeRecord;
  onUpdated: (pipe: ParrainagePipeRecord) => void;
  onDeleted: () => void;
  /** Affiche un bouton retour (vue plein panneau, sans le tableau à côté). */
  onBack?: () => void;
}

export function ParrainagePipeDetailPanel({
  pipe,
  onUpdated,
  onDeleted,
  onBack,
}: ParrainagePipeDetailPanelProps) {
  const [notes, setNotes] = useState(pipe.notes ?? "");
  const [invitationType, setInvitationType] = useState(pipe.invitation_type ?? "");
  const [timeline, setTimeline] = useState<ParrainagePipeTimelineEntry[]>([]);
  const [saving, setSaving] = useState(false);
  const savedMetaRef = useRef({ notes: pipe.notes ?? "", invitationType: pipe.invitation_type ?? "" });

  const smsAnticipationSentEntry = useMemo(
    () => timeline.find((entry) => entry.entry_type === "SMS_ENVOYE"),
    [timeline]
  );
  const smsAnticipationProfile = useMemo(
    () => smsAnticipationProfileFromSentNote(smsAnticipationSentEntry?.contenu),
    [smsAnticipationSentEntry]
  );
  const smsAnticipationProfileLabel = useMemo(
    () => smsAnticipationProfileLabelFromSentNote(smsAnticipationSentEntry?.contenu),
    [smsAnticipationSentEntry]
  );

  // Resynchro uniquement au changement de fiche : ne pas écraser une saisie en cours
  // avec l'écho serveur d'une sauvegarde (autosave notes, changement d'étape, etc.).
  useEffect(() => {
    setNotes(pipe.notes ?? "");
    setInvitationType(pipe.invitation_type ?? "");
    savedMetaRef.current = { notes: pipe.notes ?? "", invitationType: pipe.invitation_type ?? "" };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pipe.id]);

  useEffect(() => {
    void listParrainagePipeTimelineEntries(pipe.id)
      .then(setTimeline)
      .catch(() => setTimeline([]));
  }, [pipe.id, pipe.updated_at]);

  useEffect(() => {
    if (notes === savedMetaRef.current.notes && invitationType === savedMetaRef.current.invitationType) {
      return;
    }
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const updated = await updateParrainagePipe(pipe.id, {
            notes: notes.trim() || null,
            invitation_type: invitationType || null,
          });
          savedMetaRef.current = { notes, invitationType };
          onUpdated(updated);
        } catch (error) {
          toast.error(String(error));
        }
      })();
    }, 700);
    return () => clearTimeout(timer);
  }, [notes, invitationType, pipe.id, onUpdated]);

  /** Retourne `true` si l'étape a bien été changée (l'erreur est déjà affichée via toast sinon). */
  const changeStage = async (
    stage: ParrainagePipeStage,
    options?: { silent?: boolean }
  ): Promise<boolean> => {
    setSaving(true);
    try {
      const updated = await setParrainagePipeStage(pipe.id, stage, {
        invitationType: (invitationType as ParrainageInvitationType) || null,
      });
      onUpdated(updated);
      if (!options?.silent) {
        toast.success(`Étape : ${PARRAINAGE_PIPE_STAGE_LABELS[stage]}`);
      }
      return true;
    } catch (error) {
      toast.error(String(error));
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!window.confirm("Retirer ce contact du pipe parrainage ?")) return;
    setSaving(true);
    try {
      await deleteParrainagePipe(pipe.id);
      onDeleted();
      toast.success("Contact retiré du pipe");
    } catch (error) {
      toast.error(String(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col bg-card">
      <div className="border-b border-border/60 px-4 py-3">
        {onBack && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="mb-1 -ml-2 h-7 px-2 text-xs text-muted-foreground"
            onClick={onBack}
          >
            <ArrowLeft className="size-3.5 mr-1.5" />
            Retour au tableau
          </Button>
        )}
        <h2 className="text-base font-semibold">{formatParrainageContactLabel(pipe)}</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Exercice {pipe.exercice_label} — {PARRAINAGE_PIPE_STAGE_LABELS[pipe.stage as ParrainagePipeStage]}
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Étape</Label>
              <Select value={pipe.stage} onValueChange={(v) => void changeStage(v as ParrainagePipeStage)} disabled={saving}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PARRAINAGE_PIPE_STAGES.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {PARRAINAGE_PIPE_STAGE_LABELS[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Type d&apos;invitation</Label>
              <Select value={invitationType || "none"} onValueChange={(v) => setInvitationType(v === "none" ? "" : v)} disabled={saving}>
                <SelectTrigger>
                  <SelectValue placeholder="JD ou PO" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Non renseigné</SelectItem>
                  {PARRAINAGE_INVITATION_TYPES.map((type) => (
                    <SelectItem key={type} value={type}>
                      {PARRAINAGE_INVITATION_LABELS[type]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <DictationTextarea value={notes} onChange={setNotes} rows={4} disabled={saving} />
            </div>

            {timeline.length > 0 && (
              <div className="space-y-2">
                <Label>Historique</Label>
                <ul className="space-y-2 text-sm">
                  {timeline.map((entry) => (
                    <li key={entry.id} className="rounded-md border border-border/50 bg-muted/20 px-3 py-2">
                      <p className="text-xs font-medium">{entry.titre ?? entry.entry_type}</p>
                      {entry.contenu && (
                        <p className="text-sm mt-1 whitespace-pre-wrap">
                          {entry.entry_type === "SMS_ENVOYE"
                            ? displaySmsAnticipationSentNote(entry.contenu)
                            : entry.contenu}
                        </p>
                      )}
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {new Date(entry.occurred_at * 1000).toLocaleString("fr-FR")}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div>
            <ParrainageScriptPanel
              pipe={pipe}
              smsAnticipationProfile={smsAnticipationProfile}
              smsAnticipationProfileLabel={smsAnticipationProfileLabel}
              onNoteSaved={() => {
                void listParrainagePipeTimelineEntries(pipe.id)
                  .then(setTimeline)
                  .catch(() => setTimeline([]));
              }}
              onAdvanceStage={() => {
                const nextStage =
                  pipe.stage === "A_CONTACTER"
                    ? "ATTENTE_REPONSE"
                    : pipe.stage === "ATTENTE_REPONSE"
                      ? "PRISE_DE_CONTACT"
                      : pipe.stage === "PRISE_DE_CONTACT"
                        ? "CONFIRME"
                        : null;
                return nextStage ? changeStage(nextStage, { silent: true }) : true;
              }}
            />
          </div>
        </div>
      </div>

      <div className="border-t border-border/60 p-3">
        <Button variant="destructive" size="sm" onClick={() => void handleDelete()} disabled={saving}>
          <Trash2 className="size-4 mr-2" />
          Retirer du pipe
        </Button>
      </div>
    </div>
  );
}
