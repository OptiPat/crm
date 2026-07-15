import { useEffect, useMemo, useRef, useState } from "react";
import { Briefcase, ClipboardList, PhoneCall } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { getAllContacts, getContactById, getContactsByFoyer, type Contact } from "@/lib/api/tauri-contacts";
import { subscribeContactsChanged } from "@/lib/contacts/contact-events";
import {
  createPipe,
  updatePipe,
  type PipeRecord,
  type NewPipeInput,
} from "@/lib/api/tauri-pipe";
import {
  PIPE_STAGES,
  PIPE_STAGE_DESCRIPTIONS,
  PIPE_STAGE_FIELD_LABEL,
  PIPE_STAGE_LABELS,
  PIPE_TYPES,
  PIPE_TYPE_DESCRIPTIONS,
  PIPE_TYPE_LABELS,
  canBePipeParent,
  defaultPipeStage,
  defaultPipeTitreFromContact,
  defaultPipeTitreFromCouple,
  isPipeFormCreateStage,
  isPipeFormDirectStage,
  isTerminalPipeStage,
  pipeTypeUsesStage,
  validatePipeForm,
  type PipeStage,
  type PipeType,
} from "@/lib/pipe/pipe-types";
import { isPipeRdvStage, type PipeRdvStage } from "@/lib/pipe/pipe-rdv-stage";
import { defaultSuiviPipeTitre } from "@/lib/pipe/pipe-suivi";
import { isPipeFormDirty, type PipeFormSnapshot } from "@/lib/pipe/pipe-form-dirty";
import { PipeContactSelect } from "@/components/pipe/PipeContactSelect";
import {
  createInitialSuiviStelliumActs,
  SuiviStelliumActsForm,
  type SuiviStelliumActRow,
} from "@/components/pipe/SuiviStelliumActsForm";
import {
  applySuiviStelliumActsAfterPipeCreate,
  validateSuiviStelliumActs,
} from "@/lib/placement/suivi-stellium-acts";
import { parseMontantEurosToCentimes } from "@/lib/pipe/placement-montant";
import { toast } from "sonner";

const TYPE_ICONS = {
  AFFAIRE: Briefcase,
  ACTE_GESTION: ClipboardList,
  ACTION: PhoneCall,
} as const;

interface PipeFormPanelProps {
  pipe?: PipeRecord | null;
  allPipes: PipeRecord[];
  initialType?: PipeType;
  defaultContactId?: number;
  initialParentPipeId?: number | null;
  initialTitre?: string;
  onRequestRdvStage?: (stage: PipeRdvStage, options: { isDirty: boolean }) => void;
  onRequestTerminalStage?: (stage: PipeStage, options: { isDirty: boolean }) => void;
  onDirtyChange?: (isDirty: boolean) => void;
  onSuccess: (pipe: PipeRecord) => void;
  onCancel: () => void;
}

interface FormState {
  contactId: number;
  secondaryContactId: number;
  pipeType: PipeType;
  parentPipeId: number | null;
  titre: string;
  stage: PipeStage | "";
  notes: string;
}

function buildFormState(
  pipe: PipeRecord | null | undefined,
  initialType: PipeType,
  defaultContactId?: number,
  options?: { initialParentPipeId?: number | null; initialTitre?: string }
): FormState {
  if (pipe) {
    return {
      contactId: pipe.contact_id,
      secondaryContactId: pipe.secondary_contact_id ?? 0,
      pipeType: (pipe.pipe_type as PipeType) ?? "AFFAIRE",
      parentPipeId: pipe.parent_pipe_id ?? null,
      titre: pipe.titre,
      stage:
        pipe.stage && pipeTypeUsesStage(pipe.pipe_type as PipeType)
          ? (pipe.stage as PipeStage)
          : "",
      notes: pipe.notes ?? "",
    };
  }
  return {
    contactId: defaultContactId ?? 0,
    secondaryContactId: 0,
    pipeType: initialType,
    parentPipeId: options?.initialParentPipeId ?? null,
    titre: options?.initialTitre ?? "",
    stage: defaultPipeStage(initialType) || "",
    notes: "",
  };
}

function toPayload(form: FormState): NewPipeInput {
  return {
    contact_id: form.contactId,
    secondary_contact_id:
      form.pipeType === "AFFAIRE" && form.secondaryContactId > 0
        ? form.secondaryContactId
        : null,
    pipe_type: form.pipeType,
    parent_pipe_id: form.parentPipeId,
    titre: form.titre.trim(),
    stage: pipeTypeUsesStage(form.pipeType)
      ? form.stage || defaultPipeStage(form.pipeType)
      : null,
    notes: form.notes.trim() || null,
  };
}

export function PipeFormPanel({
  pipe,
  allPipes,
  initialType = "AFFAIRE",
  defaultContactId,
  initialParentPipeId = null,
  initialTitre,
  onRequestRdvStage,
  onRequestTerminalStage,
  onDirtyChange,
  onSuccess,
  onCancel,
}: PipeFormPanelProps) {
  const [contacts, setContacts] = useState<Contact[]>([]);
  const buildOptions = useMemo(
    () => ({ initialParentPipeId, initialTitre }),
    [initialParentPipeId, initialTitre]
  );

  const [form, setForm] = useState<FormState>(() =>
    buildFormState(pipe, initialType, defaultContactId, buildOptions)
  );
  const [suiviStelliumActs, setSuiviStelliumActs] = useState<SuiviStelliumActRow[]>(() =>
    createInitialSuiviStelliumActs()
  );
  const [loading, setLoading] = useState(false);
  const contactHintRef = useRef<Contact | null>(null);
  const secondaryHintRef = useRef<Contact | null>(null);
  const titreEditedRef = useRef(false);
  /** Contact pour lequel l'utilisateur a retiré le co-contact foyer (évite le re-remplissage auto). */
  const foyerCoContactDismissedRef = useRef<number | null>(null);

  const initialFormRef = useRef<PipeFormSnapshot>(
    buildFormState(pipe, initialType, defaultContactId, buildOptions)
  );

  useEffect(() => {
    const next = buildFormState(pipe, initialType, defaultContactId, buildOptions);
    setForm(next);
    setSuiviStelliumActs(createInitialSuiviStelliumActs());
    initialFormRef.current = next;
    contactHintRef.current = null;
    secondaryHintRef.current = null;
    titreEditedRef.current = Boolean(buildOptions.initialTitre?.trim());
    foyerCoContactDismissedRef.current = null;
  }, [pipe, initialType, defaultContactId, buildOptions]);

  useEffect(() => {
    let cancelled = false;
    const loadContacts = () => {
      void getAllContacts()
        .then((list) => {
          if (!cancelled) setContacts(list);
        })
        .catch(console.error);
    };
    loadContacts();
    const unsub = subscribeContactsChanged(() => loadContacts());
    return () => {
      cancelled = true;
      unsub();
    };
  }, []);

  useEffect(() => {
    if (
      pipe ||
      form.pipeType !== "AFFAIRE" ||
      form.contactId <= 0 ||
      form.secondaryContactId > 0 ||
      foyerCoContactDismissedRef.current === form.contactId
    ) {
      return;
    }
    const primary = contacts.find((c) => c.id === form.contactId);
    if (!primary?.foyer_id) return;
    let cancelled = false;
    void getContactsByFoyer(primary.foyer_id).then((members) => {
      if (cancelled) return;
      const conjoint = members.find((m) => m.id !== form.contactId);
      if (!conjoint?.id) return;
      setForm((prev) => {
        if (prev.contactId !== form.contactId || prev.secondaryContactId > 0) return prev;
        return {
          ...prev,
          secondaryContactId: conjoint.id,
          titre: titreEditedRef.current
            ? prev.titre
            : defaultPipeTitreFromCouple(primary, conjoint),
        };
      });
    });
    return () => {
      cancelled = true;
    };
  }, [pipe, contacts, form.contactId, form.pipeType, form.secondaryContactId]);

  const resolveCoupleTitre = (state: FormState, secondaryHint?: Contact | null) => {
    const primary =
      contacts.find((c) => c.id === state.contactId) ??
      (contactHintRef.current?.id === state.contactId ? contactHintRef.current : null);
    const secondary =
      state.secondaryContactId > 0
        ? (secondaryHint ??
          contacts.find((c) => c.id === state.secondaryContactId) ??
          (secondaryHintRef.current?.id === state.secondaryContactId
            ? secondaryHintRef.current
            : null))
        : null;
    if (!primary) return "";
    return defaultPipeTitreFromCouple(primary, secondary);
  };

  const suggestTitreForContact = (contact: Contact, state: FormState) => {
    if (state.pipeType === "ACTE_GESTION") {
      return defaultSuiviPipeTitre(contact);
    }
    return defaultPipeTitreFromContact(contact);
  };

  const handleContactCreated = (contact: Contact) => {
    if (!contact.id) {
      toast.error("Contact créé sans identifiant — réessayez.");
      return;
    }
    contactHintRef.current = contact;
    setContacts((prev) => {
      if (prev.some((c) => c.id === contact.id)) return prev;
      return [...prev, contact];
    });
    setForm((prev) => ({
      ...prev,
      contactId: contact.id,
      parentPipeId: prev.parentPipeId,
      titre: titreEditedRef.current ? prev.titre : suggestTitreForContact(contact, prev),
    }));
  };

  const handleContactChange = (contactId: number) => {
    const contact =
      contacts.find((c) => c.id === contactId) ??
      (contactHintRef.current?.id === contactId ? contactHintRef.current : undefined);
    if (contact) contactHintRef.current = contact;
    setForm((prev) => {
      const secondaryContactId =
        prev.secondaryContactId === contactId ? 0 : prev.secondaryContactId;
      const next = {
        ...prev,
        contactId,
        secondaryContactId,
        parentPipeId: prev.parentPipeId,
      };
      return {
        ...next,
        titre: titreEditedRef.current
          ? prev.titre
          : prev.pipeType === "ACTE_GESTION" && contact
            ? defaultSuiviPipeTitre(contact)
            : resolveCoupleTitre({ ...next, contactId, secondaryContactId }),
      };
    });
  };

  const handleSecondaryContactChange = (
    secondaryContactId: number,
    secondaryHint?: Contact
  ) => {
    if (secondaryHint) secondaryHintRef.current = secondaryHint;
    setForm((prev) => {
      if (secondaryContactId === 0) {
        foyerCoContactDismissedRef.current = prev.contactId;
      }
      const next = { ...prev, secondaryContactId };
      return {
        ...next,
        titre: titreEditedRef.current
          ? prev.titre
          : resolveCoupleTitre({ ...next, secondaryContactId }, secondaryHint),
      };
    });
  };

  const resolveTitreFromState = (state: FormState) => {
    const trimmed = state.titre.trim();
    if (trimmed) return trimmed;
    return resolveCoupleTitre(state);
  };

  const resolveTitre = async (state: FormState) => {
    const fromState = resolveTitreFromState(state);
    if (fromState || !state.contactId) return fromState;
    try {
      const contact = await getContactById(state.contactId);
      contactHintRef.current = contact;
      let secondary: Contact | null = null;
      if (state.secondaryContactId > 0) {
        secondary =
          contacts.find((c) => c.id === state.secondaryContactId) ??
          (await getContactById(state.secondaryContactId).catch(() => null));
      }
      return defaultPipeTitreFromCouple(contact, secondary);
    } catch {
      return "";
    }
  };

  const formIsDirty = useMemo(
    () => isPipeFormDirty(initialFormRef.current, form),
    [form]
  );

  useEffect(() => {
    onDirtyChange?.(formIsDirty);
  }, [formIsDirty, onDirtyChange]);

  const parentOptions = useMemo(
    () =>
      allPipes.filter(
        (p) =>
          p.contact_id === form.contactId &&
          canBePipeParent(p.pipe_type as PipeType) &&
          p.id !== pipe?.id
      ),
    [allPipes, form.contactId, pipe?.id]
  );

  const handleTypeChange = (pipeType: PipeType) => {
    setForm((prev) => ({
      ...prev,
      pipeType,
      secondaryContactId: pipeType === "AFFAIRE" ? prev.secondaryContactId : 0,
      stage: pipeTypeUsesStage(pipeType) ? defaultPipeStage(pipeType) : "",
      parentPipeId:
        prev.parentPipeId && parentOptions.some((p) => p.id === prev.parentPipeId)
          ? prev.parentPipeId
          : null,
    }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.contactId) {
      toast.error("Le contact est obligatoire.");
      return;
    }
    let titre = await resolveTitre(form);
    if (!titre.trim()) {
      toast.error(
        "Impossible de déduire le titre depuis le contact. Saisissez un titre ou complétez prénom/nom."
      );
      return;
    }
    if (titre !== form.titre.trim()) {
      setForm((prev) => ({ ...prev, titre }));
    }
    const error = validatePipeForm({
      titre,
      contactId: form.contactId,
      secondaryContactId: form.secondaryContactId,
      pipeType: form.pipeType,
      stage: form.stage || defaultPipeStage(form.pipeType),
    });
    if (error) {
      toast.error(error);
      return;
    }
    const isSuiviCreate = !pipe && form.pipeType === "ACTE_GESTION";
    if (isSuiviCreate) {
      const actsError = validateSuiviStelliumActs(suiviStelliumActs);
      if (actsError) {
        toast.error(actsError);
        return;
      }
    }
    setLoading(true);
    try {
      const payload = toPayload({ ...form, titre });
      const saved = pipe
        ? await updatePipe(pipe.id, payload)
        : await createPipe(payload);
      if (isSuiviCreate) {
        await applySuiviStelliumActsAfterPipeCreate(
          saved,
          suiviStelliumActs.map((row) => ({
            productLabel: row.productLabel,
            actLabel: row.actLabel,
            montantCentimes: parseMontantEurosToCentimes(row.montantEuros),
          }))
        );
      }
      toast.success(pipe ? "Enregistré" : "Pipe créé");
      onSuccess(saved);
    } catch (err) {
      console.error(err);
      toast.error(String(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex h-full flex-col">
      <div className="border-b px-5 py-4">
        <h2 className="text-lg font-semibold">{pipe ? "Modifier" : "Nouveau pipe"}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choisissez le type, le contact, puis décrivez le sujet.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
        <div className="space-y-2">
          <Label>Type *</Label>
          <div className="grid gap-2 sm:grid-cols-3">
            {PIPE_TYPES.map((type) => {
              const Icon = TYPE_ICONS[type];
              const active = form.pipeType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    active
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border hover:bg-muted/50"
                  )}
                >
                  <Icon className={cn("h-4 w-4 mb-2", active ? "text-primary" : "text-muted-foreground")} />
                  <p className="text-sm font-medium">{PIPE_TYPE_LABELS[type]}</p>
                  <p className="text-xs text-muted-foreground mt-1 leading-snug">
                    {PIPE_TYPE_DESCRIPTIONS[type]}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <PipeContactSelect
          contacts={contacts}
          value={form.contactId}
          onChange={handleContactChange}
          onContactCreated={handleContactCreated}
        />

        {form.pipeType === "AFFAIRE" && form.contactId > 0 && (
          <div className="space-y-2">
            <PipeContactSelect
              contacts={contacts}
              value={form.secondaryContactId}
              onChange={handleSecondaryContactChange}
              onContactCreated={(contact) => {
                setContacts((prev) => {
                  if (prev.some((c) => c.id === contact.id)) return prev;
                  return [...prev, contact];
                });
                handleSecondaryContactChange(contact.id ?? 0, contact);
              }}
              excludeContactId={form.contactId}
              label="Co-contact (couple, optionnel)"
              optional
              placeholder="Ajouter le conjoint…"
            />
            {form.secondaryContactId > 0 && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-muted-foreground"
                onClick={() => handleSecondaryContactChange(0)}
              >
                Retirer le co-contact
              </Button>
            )}
          </div>
        )}

        {form.pipeType === "AFFAIRE" && form.secondaryContactId > 0 && (
          <p className="text-xs text-muted-foreground -mt-3">
            Les dates de prospection (R1, dernier contact) sont synchronisées sur les deux fiches
            contact.
          </p>
        )}

        {parentOptions.length > 0 && (
          <div className="space-y-2">
            <Label>Rattaché à (optionnel)</Label>
            <Select
              value={form.parentPipeId ? String(form.parentPipeId) : "__none__"}
              onValueChange={(v) =>
                setForm((prev) => ({
                  ...prev,
                  parentPipeId: v === "__none__" ? null : Number(v),
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Pipe parent" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Aucun — pipe autonome</SelectItem>
                {parentOptions.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {PIPE_TYPE_LABELS[p.pipe_type as PipeType] ?? p.pipe_type} — {p.titre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}

        <div className="space-y-2">
          <Label>Titre *</Label>
          <Input
            value={form.titre}
            onChange={(e) => {
              titreEditedRef.current = true;
              setForm((prev) => ({ ...prev, titre: e.target.value }));
            }}
            placeholder={
              form.contactId
                ? resolveTitreFromState(form) || "Prénom Nom du contact"
                : form.pipeType === "ACTION"
                  ? "Ex. Appel de prise de contact"
                  : form.pipeType === "ACTE_GESTION"
                    ? "Ex. Dupont Jean — suivi mai 2026"
                    : "Ex. SCPI Corum 50 k€"
            }
            autoFocus
          />
        </div>

        {!pipe && form.pipeType === "ACTE_GESTION" && (
          <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
            <div>
              <p className="text-sm font-medium">Actes Stellium</p>
              <p className="text-xs text-muted-foreground mt-0.5 leading-snug">
                Un ou plusieurs actes avec le suivi. Versement complémentaire ouvre une affaire
                rattachée. Confirmez l&apos;envoi Stellium depuis la fiche une fois le dossier prêt.
              </p>
            </div>
            <SuiviStelliumActsForm acts={suiviStelliumActs} onChange={setSuiviStelliumActs} />
          </div>
        )}

        {pipeTypeUsesStage(form.pipeType) && (
          <div className="space-y-2">
            <Label>{PIPE_STAGE_FIELD_LABEL} *</Label>
            <p className="text-xs text-muted-foreground -mt-1">
              {pipe
                ? "Où en est cette affaire dans le cycle commercial (uniquement pour les affaires)."
                : "Étape de départ — client déjà vu (R1/R2 faits) : choisissez R2 ou R3 directement."}
            </p>
            <div className="space-y-2">
              {PIPE_STAGES.map((stage) => {
                const active = (form.stage || "PROSPECTION") === stage;
                const isCreate = !pipe;
                const rdvOnly =
                  !isCreate &&
                  isPipeRdvStage(stage) &&
                  onRequestRdvStage != null;
                const terminalViaDialog =
                  !isCreate &&
                  isTerminalPipeStage(stage) &&
                  onRequestTerminalStage != null;
                const hiddenOnCreate = isCreate && !isPipeFormCreateStage(stage);

                if (hiddenOnCreate) return null;

                const handleStageClick = () => {
                  if (rdvOnly) {
                    onRequestRdvStage(stage, { isDirty: formIsDirty });
                    return;
                  }
                  if (terminalViaDialog) {
                    onRequestTerminalStage(stage, { isDirty: formIsDirty });
                    return;
                  }
                  if (isCreate ? isPipeFormCreateStage(stage) : isPipeFormDirectStage(stage)) {
                    setForm((prev) => ({ ...prev, stage }));
                  }
                };

                return (
                  <button
                    key={stage}
                    type="button"
                    onClick={handleStageClick}
                    className={cn(
                      "w-full rounded-lg border px-3 py-2.5 text-left transition-colors",
                      active
                        ? "border-primary bg-primary/5"
                        : "border-border hover:bg-muted/40"
                    )}
                  >
                    <p className="text-sm font-medium">{PIPE_STAGE_LABELS[stage]}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {rdvOnly
                        ? "Planifier un RDV dans le journal"
                        : terminalViaDialog
                          ? "Valider avec notes d'étape"
                          : PIPE_STAGE_DESCRIPTIONS[stage]}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <DictationTextarea
          label="Notes"
          value={form.notes}
          onChange={(notes) => setForm((prev) => ({ ...prev, notes }))}
          rows={3}
          placeholder="Contexte, prochaine étape…"
        />
      </div>

      <div className="border-t px-5 py-4 flex justify-end gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>
          Annuler
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? "Enregistrement…" : pipe ? "Enregistrer" : "Créer le pipe"}
        </Button>
      </div>
    </form>
  );
}
