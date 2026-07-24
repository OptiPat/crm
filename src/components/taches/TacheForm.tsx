import { useEffect, useMemo, useState } from "react";
import { AlertCircle, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ContactMultiSelect } from "@/components/contacts/ContactMultiSelect";
import { getAllContacts, type Contact } from "@/lib/api/tauri-contacts";
import {
  createTache,
  getAllTaches,
  updateTache,
  type NewTache,
  type Tache,
  type TachePriorite,
} from "@/lib/api/tauri-taches";
import { dateInputToUnix, unixToDateInput } from "@/lib/dates/calendar-date";
import {
  TACHE_DATE_SHORTCUTS_EXTENDED,
  dateInputAddDays,
  dateInputToday,
  defaultCreateDateEcheance,
  prioriteForEcheanceDate,
  type TacheDateShortcut,
} from "@/lib/taches/tache-date-shortcuts";
import {
  TACHE_TITLE_PRESETS,
  buildTitlePresetContext,
  buildTacheTitlePlaceholder,
  findSimilarPendingTache,
  isGlobalTacheCreate,
  resolveTacheFormContextBanner,
  type TacheFormCreationContext,
} from "@/lib/taches/tache-form-presets";
import { TacheRecurrenceFields } from "@/components/taches/TacheRecurrenceFields";
import { isActiveRecurrence, type TacheRecurrence } from "@/lib/taches/tache-recurrence";
import { toast } from "sonner";
import {
  nestedStackedDialogClass,
  nestedStackedOutsideHandlers,
  nestedStackedPortalLayer,
} from "@/lib/ui/nested-stacked-dialog";
import {
  stopWheelPropagation,
  useLockAppMainScroll,
} from "@/lib/ui/nested-sheet-scroll";
import { PortalLayerProvider } from "@/lib/ui/portal-layer-context";
import { TeamLockBanner } from "@/components/team/TeamLockBanner";
import { useTeamFormRecordLock } from "@/hooks/useTeamFormRecordLock";

interface TacheFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  tache?: Tache | null;
  fixedContactId?: number;
  fixedContactIds?: number[];
  defaultTitle?: string;
  defaultDateEcheance?: string;
  creationContext?: TacheFormCreationContext;
  onSuccess?: () => void;
  nestedSheet?: boolean;
}

interface FormState {
  titre: string;
  description: string;
  dateEcheance: string;
  priorite: TachePriorite;
  contactIds: number[];
  recurrenceEnabled: boolean;
  recurrence: TacheRecurrence | null;
}

function buildState(
  tache?: Tache | null,
  fixedContactId?: number,
  fixedContactIds?: number[],
  defaultTitle?: string,
  defaultDateEcheance?: string,
): FormState {
  const linked = tache?.contacts?.map((c) => c.contact_id) ?? [];
  let contactIds = linked;
  if (!tache) {
    if (fixedContactIds && fixedContactIds.length > 0) {
      contactIds = fixedContactIds;
    } else if (fixedContactId != null) {
      contactIds = [fixedContactId];
    }
  }
  return {
    titre: tache?.titre ?? defaultTitle ?? "",
    description: tache?.description ?? "",
    dateEcheance: tache?.date_echeance
      ? unixToDateInput(tache.date_echeance)
      : defaultCreateDateEcheance(defaultDateEcheance),
    priorite: tache?.priorite ?? "NORMALE",
    contactIds,
    recurrenceEnabled: isActiveRecurrence(tache?.recurrence ?? null),
    recurrence: tache?.recurrence ?? null,
  };
}

function buildCreateAnotherState(
  fixedContactId?: number,
  fixedContactIds?: number[],
): FormState {
  let contactIds: number[] = [];
  if (fixedContactIds && fixedContactIds.length > 0) {
    contactIds = fixedContactIds;
  } else if (fixedContactId != null) {
    contactIds = [fixedContactId];
  }
  return {
    titre: "",
    description: "",
    dateEcheance: defaultCreateDateEcheance(),
    priorite: "NORMALE",
    contactIds,
    recurrenceEnabled: false,
    recurrence: null,
  };
}

function resolveDateShortcutValue(
  shortcut: TacheDateShortcut,
  nowMs: number = Date.now()
): string {
  if ("days" in shortcut) {
    return shortcut.days === 0
      ? dateInputToday(nowMs)
      : dateInputAddDays(null, shortcut.days, nowMs);
  }
  return shortcut.resolve(nowMs);
}

export function TacheForm({
  open,
  onOpenChange,
  tache,
  fixedContactId,
  fixedContactIds,
  defaultTitle,
  defaultDateEcheance,
  creationContext,
  onSuccess,
  nestedSheet = false,
}: TacheFormProps) {
  useLockAppMainScroll(open && nestedSheet);
  const [loading, setLoading] = useState(false);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [existingTaches, setExistingTaches] = useState<Tache[]>([]);
  const [form, setForm] = useState<FormState>(
    buildState(tache, fixedContactId, fixedContactIds, defaultTitle, defaultDateEcheance),
  );
  const teamLock = useTeamFormRecordLock({
    open,
    onOpenChange,
    entityType: "tache",
    entityId: tache?.id,
  });
  const fixedContactIdsKey = fixedContactIds?.join(",") ?? "";
  const isCreate = !tache;
  const contactFirst = isGlobalTacheCreate({ tache, fixedContactId, fixedContactIds });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    Promise.all([getAllContacts(), isCreate ? getAllTaches() : Promise.resolve([])])
      .then(([list, taches]) => {
        if (!cancelled) {
          setContacts(list);
          setExistingTaches(taches);
        }
      })
      .catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [open, isCreate]);

  useEffect(() => {
    if (open) {
      setForm(
        buildState(
          tache,
          fixedContactId,
          fixedContactIds,
          defaultTitle,
          defaultDateEcheance
        )
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, tache?.id, fixedContactId, fixedContactIdsKey, defaultTitle, defaultDateEcheance]);

  const presetCtx = useMemo(
    () => buildTitlePresetContext(form.contactIds, contacts),
    [form.contactIds, contacts]
  );

  const titlePlaceholder = useMemo(
    () => buildTacheTitlePlaceholder(presetCtx),
    [presetCtx]
  );

  const contextBanner = useMemo(
    () =>
      resolveTacheFormContextBanner({
        tache,
        creationContext,
        fixedContactId,
        fixedContactIds,
        contacts,
      }),
    [tache, creationContext, fixedContactId, fixedContactIds, contacts]
  );

  const similarTache = useMemo(
    () =>
      isCreate
        ? findSimilarPendingTache(existingTaches, form.titre, form.contactIds)
        : null,
    [isCreate, existingTaches, form.titre, form.contactIds]
  );

  const setDateEcheance = (dateEcheance: string) => {
    setForm((prev) => ({
      ...prev,
      dateEcheance,
      priorite: prioriteForEcheanceDate(dateEcheance, prev.priorite),
    }));
  };

  const setContactIds = (contactIds: number[]) => {
    setForm((prev) => ({ ...prev, contactIds }));
  };

  const persist = async (createAnother: boolean) => {
    if (!teamLock.ready) return;
    const titre = form.titre.trim();
    if (!titre) {
      toast.error("Le titre est obligatoire");
      return;
    }
    setLoading(true);
    try {
      const payload: NewTache = {
        contact_ids: form.contactIds,
        titre,
        description: form.description.trim() || null,
        date_echeance: dateInputToUnix(form.dateEcheance),
        priorite: form.priorite,
        statut: tache?.statut ?? "A_FAIRE",
        recurrence: form.recurrenceEnabled ? form.recurrence : null,
      };
      if (tache) {
        await updateTache(tache.id, payload);
        onSuccess?.();
        onOpenChange(false);
      } else {
        await createTache(payload);
        onSuccess?.();
        if (createAnother) {
          setForm(buildCreateAnotherState(fixedContactId, fixedContactIds));
          toast.success("Tâche créée — saisissez la suivante");
        } else {
          onOpenChange(false);
        }
      }
    } catch (error) {
      console.error(error);
      toast.error(`Erreur : ${String(error)}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void persist(false);
  };

  const contactField = (
    <ContactMultiSelect
      label="Contacts liés (facultatif)"
      hint="Une tâche peut concerner plusieurs contacts."
      contacts={contacts}
      value={form.contactIds}
      onChange={setContactIds}
    />
  );

  const titleField = (
    <div className="space-y-2">
      <Label>Titre *</Label>
      <Input
        value={form.titre}
        onChange={(e) => setForm({ ...form, titre: e.target.value })}
        placeholder={titlePlaceholder}
        autoFocus={!contactFirst}
      />
      {isCreate && (
        <div className="flex flex-wrap gap-1.5">
          {TACHE_TITLE_PRESETS.map((preset) => (
            <Button
              key={preset.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() =>
                setForm({ ...form, titre: preset.build(presetCtx) })
              }
            >
              {preset.label}
            </Button>
          ))}
        </div>
      )}
    </div>
  );

  const scheduleField = (
    <div className="grid grid-cols-2 gap-3">
      <div className="space-y-2">
        <Label>{form.recurrenceEnabled ? "Première échéance" : "Échéance"}</Label>
        <Input
          type="date"
          value={form.dateEcheance}
          onChange={(e) => setDateEcheance(e.target.value)}
        />
        {form.recurrenceEnabled && (
          <p className="text-xs text-muted-foreground">
            Date de la tâche en cours uniquement. Les suivantes suivent la règle de
            récurrence.
          </p>
        )}
        <div className="flex flex-wrap gap-1.5">
          {TACHE_DATE_SHORTCUTS_EXTENDED.map((shortcut) => (
            <Button
              key={shortcut.id}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs"
              onClick={() => setDateEcheance(resolveDateShortcutValue(shortcut))}
            >
              {shortcut.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="space-y-2">
        <Label>Priorité</Label>
        <Select
          value={form.priorite}
          onValueChange={(v) => setForm({ ...form, priorite: v as TachePriorite })}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="BASSE">Basse</SelectItem>
            <SelectItem value="NORMALE">Normale</SelectItem>
            <SelectItem value="HAUTE">Haute</SelectItem>
          </SelectContent>
        </Select>
        {form.dateEcheance === dateInputToday() && form.priorite === "HAUTE" && (
          <p className="text-[11px] text-amber-700">Priorité haute pour aujourd&apos;hui</p>
        )}
      </div>
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange} modal={!nestedSheet}>
      <DialogContent
        hideOverlay={nestedSheet}
        className={nestedStackedDialogClass(
          "flex max-h-[90vh] max-w-xl flex-col overflow-hidden",
          nestedSheet
        )}
        onWheel={nestedSheet ? stopWheelPropagation : undefined}
        {...nestedStackedOutsideHandlers(nestedSheet)}
      >
        <PortalLayerProvider layer={nestedStackedPortalLayer(nestedSheet)}>
        <DialogHeader className="shrink-0">
          <DialogTitle>{tache ? "Modifier la tâche" : "Nouvelle tâche"}</DialogTitle>
          <DialogDescription>
            {isCreate
              ? "Activez la récurrence pour une série ; sinon l'échéance par défaut est demain."
              : "Modifiez le rappel, sa récurrence et ses contacts liés."}
          </DialogDescription>
        </DialogHeader>
        <TeamLockBanner
          heldBy={teamLock.heldBy}
          loading={teamLock.loading}
          message={teamLock.error}
        />

        {contextBanner && (
          <div className="flex items-start gap-2 rounded-lg border border-blue-200/80 bg-blue-50/60 px-3 py-2 text-xs text-blue-950">
            <Info className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{contextBanner}</span>
          </div>
        )}

        {similarTache && (
          <div className="flex items-start gap-2 rounded-lg border border-amber-200/80 bg-amber-50/60 px-3 py-2 text-xs text-amber-950">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              Tâche similaire déjà à faire : <strong>{similarTache.titre}</strong>
            </span>
          </div>
        )}

        <div
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1"
          onWheel={nestedSheet ? stopWheelPropagation : undefined}
        >
        <form onSubmit={handleSubmit} className="space-y-4">
          {contactFirst ? (
            <>
              {contactField}
              {titleField}
            </>
          ) : (
            <>
              {titleField}
              {contactField}
            </>
          )}

          <TacheRecurrenceFields
            enabled={form.recurrenceEnabled}
            onEnabledChange={(recurrenceEnabled) =>
              setForm((prev) => ({ ...prev, recurrenceEnabled }))
            }
            recurrence={form.recurrence}
            onRecurrenceChange={(recurrence) =>
              setForm((prev) => ({ ...prev, recurrence }))
            }
            dateEcheance={form.dateEcheance}
            onAlignEcheance={setDateEcheance}
          />

          {scheduleField}

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              rows={3}
              placeholder="Détails éventuels…"
            />
          </div>

          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            {isCreate && (
              <Button
                type="button"
                variant="secondary"
                disabled={loading}
                onClick={() => void persist(true)}
              >
                {loading ? "Enregistrement…" : "Enregistrer et en créer une autre"}
              </Button>
            )}
            <Button type="submit" disabled={loading || !teamLock.ready}>
              {loading ? "Enregistrement…" : "Enregistrer"}
            </Button>
          </DialogFooter>
        </form>
        </div>
        </PortalLayerProvider>
      </DialogContent>
    </Dialog>
  );
}
