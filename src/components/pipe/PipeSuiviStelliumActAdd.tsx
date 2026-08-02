import { useCallback, useEffect, useRef, useState } from "react";
import { Plus, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DictationTextarea } from "@/components/ui/dictation-textarea";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import type { usePipeTimeline } from "@/hooks/usePipeTimeline";
import { datetimeLocalToUnix, unixToDatetimeLocalInput } from "@/lib/pipe/pipe-timeline-types";
import {
  createPlacementOperation,
  dismissPlacementOperation,
  listPlacementOperationsForPipe,
  notifyPlacementOperationsChanged,
  PLACEMENT_OPERATIONS_CHANGED_EVENT,
  type PlacementOperation,
} from "@/lib/api/tauri-box-placement";
import {
  AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL,
  isStelliumLabelAllowedForProduct,
  placementOperationTypeFromStelliumLabel,
} from "@/lib/placement/stellium-box-placement-labels";
import { formatStelliumProductForDisplay } from "@/lib/placement/stellium-box-placement-products";
import { placementOperationIsSuiviDraft } from "@/lib/placement/suivi-placement-draft";
import {
  createVersementAffaireFromSuivi,
  validateSuiviStelliumActInput,
} from "@/lib/placement/suivi-stellium-acts";
import { isVersementComplementaireActLabel, isVersementComplementaireAffaire, VERSEMENT_COMPLEMENTAIRE_ACT_LABEL } from "@/lib/pipe/pipe-suivi";
import { StelliumPlacementActFields } from "@/components/pipe/StelliumPlacementActFields";
import { PlacementMontantField } from "@/components/pipe/PlacementMontantField";
import { toast } from "sonner";
import {
  parseMontantEurosToCentimes,
  placementOperationRequiresMontant,
  formatMontantCentimesInput,
} from "@/lib/pipe/placement-montant";
import { inferTypeProduitFromStelliumProductLabel } from "@/lib/pipe/remuneration-type-produit";
import { useArbitrageFicheConseil, isFicheConseilActionsBusy } from "@/hooks/useArbitrageFicheConseil";
import { ArbitrageFicheConseilDialogs } from "@/components/fiche-conseil/ArbitrageFicheConseilDialogs";
import { ArbitrageFicheConseilButton } from "@/components/fiche-conseil/ArbitrageFicheConseilButton";
import { isStelliumActEligibleForFicheConseil, isVpModificationStelliumAct } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-stellium";
import {
  EMPTY_VP_MODIFICATION_ACT_VALUE,
  toVpModificationPdfFillInput,
  vpModificationMontantCentimesFromAct,
  type VpModificationActValue,
} from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
import { VpModificationActFields } from "@/components/pipe/VpModificationActFields";
import { loadVpModificationMontantEurosPrefill } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-prefill";
import { resolveInvestissementIdForStelliumAct } from "@/lib/placement/resolve-investissement-for-stellium-act";

async function resolveDraftInvestissementId(
  contactId: number,
  stelliumLabel: string,
  productLabel: string,
  existingId?: number | null
): Promise<number | null> {
  if (existingId != null && existingId > 0) return existingId;
  if (!isStelliumActEligibleForFicheConseil(stelliumLabel, productLabel)) return null;
  return resolveInvestissementIdForStelliumAct(contactId, productLabel);
}

type PipeStelliumActAddVariant = "suivi" | "affaire";

interface PipeSuiviStelliumActAddProps {
  timeline: ReturnType<typeof usePipeTimeline>;
  pipe: Pick<
    PipeRecord,
    | "id"
    | "pipe_type"
    | "contact_id"
    | "parent_pipe_id"
    | "secondary_contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "titre"
  >;
  onAdded?: () => void;
  variant?: PipeStelliumActAddVariant;
}

const VARIANT_COPY: Record<
  PipeStelliumActAddVariant,
  { title: string; description: string; addButton: string; createSuccess: string }
> = {
  suivi: {
    title: "Stellium — actes de gestion",
    description:
      "L'acte est créé avec le suivi. Quand le dossier part chez Stellium (après signature client, etc.), confirmez l'envoi pour passer en attente de réponse.",
    addButton: "Autre acte Stellium",
    createSuccess: "Acte ajouté — confirmez l'envoi Stellium quand le dossier part",
  },
  affaire: {
    title: "Stellium — envoi partenaire",
    description:
      "Souscription partenaire : choisissez le produit. Quand le dossier part chez Stellium, confirmez l'envoi pour passer en attente de réponse.",
    addButton: "Souscription partenaire",
    createSuccess: "Souscription préparée — confirmez l'envoi Stellium quand le dossier part",
  },
};

function formatDraftLabel(operation: PlacementOperation): string {
  const acte = operation.stellium_label?.trim();
  const produit = formatStelliumProductForDisplay(operation.product_label?.trim() ?? "");
  const montant =
    operation.montant_centimes != null && operation.montant_centimes > 0
      ? formatMontantCentimesInput(operation.montant_centimes)
      : "";
  const detail = [produit, montant ? `${montant} €` : ""].filter(Boolean).join(" · ");
  if (acte && isVersementComplementaireActLabel(acte)) {
    return detail ? `${acte} · ${detail}` : acte;
  }
  if (acte && detail) return `${acte} · ${detail}`;
  return acte || detail || "Acte Stellium";
}

export function PipeSuiviStelliumActAdd({
  timeline,
  pipe,
  onAdded,
  variant = "suivi",
}: PipeSuiviStelliumActAddProps) {
  const copy = VARIANT_COPY[variant];
  const isVersementChild = variant === "affaire" && isVersementComplementaireAffaire(pipe);
  const ficheConseil = useArbitrageFicheConseil();
  const { startFicheConseilForStelliumAct } = ficheConseil;
  const ficheDisabled = isFicheConseilActionsBusy(ficheConseil);
  const [drafts, setDrafts] = useState<PlacementOperation[]>([]);
  const [loadingDrafts, setLoadingDrafts] = useState(true);
  const [openNew, setOpenNew] = useState(false);
  const [stelliumLabel, setStelliumLabel] = useState("");
  const [productLabel, setProductLabel] = useState("");
  const [montantEuros, setMontantEuros] = useState("");
  const [newActVpModification, setNewActVpModification] = useState<VpModificationActValue>({
    ...EMPTY_VP_MODIFICATION_ACT_VALUE,
  });
  const [draftOccurredAt, setDraftOccurredAt] = useState<Record<number, string>>({});
  const [draftContenu, setDraftContenu] = useState<Record<number, string>>({});
  const [draftVpModification, setDraftVpModification] = useState<
    Record<number, VpModificationActValue>
  >({});
  const [savingId, setSavingId] = useState<number | "new" | null>(null);
  const draftsLoadedRef = useRef(false);

  const newActNeedsMontant = placementOperationRequiresMontant({
    operationType: placementOperationTypeFromStelliumLabel(stelliumLabel.trim() || "AUTRE"),
    stelliumLabel,
    pipeType: pipe.pipe_type,
  });
  const newActIsVpModification = isVpModificationStelliumAct(stelliumLabel);

  const buildRemunerationPayload = (product: string, montantRaw: string) => {
    const montant_centimes = parseMontantEurosToCentimes(montantRaw);
    const type_produit = product
      ? inferTypeProduitFromStelliumProductLabel(product)
      : undefined;
    return { montant_centimes, type_produit };
  };

  const PLACEMENT_RELOAD_DEBOUNCE_MS = 150;

  const defaultOccurredAt = () => unixToDatetimeLocalInput();

  const syncDraftFields = useCallback((nextDrafts: PlacementOperation[]) => {
    const defaultAt = defaultOccurredAt();
    setDraftOccurredAt((prev) => {
      const next: Record<number, string> = {};
      for (const draft of nextDrafts) {
        next[draft.id] = prev[draft.id] ?? defaultAt;
      }
      return next;
    });
    setDraftContenu((prev) => {
      const next: Record<number, string> = {};
      for (const draft of nextDrafts) {
        next[draft.id] = prev[draft.id] ?? "";
      }
      return next;
    });
    setDraftVpModification((prev) => {
      const next: Record<number, VpModificationActValue> = {};
      for (const draft of nextDrafts) {
        const existing = prev[draft.id] ?? { ...EMPTY_VP_MODIFICATION_ACT_VALUE };
        if (
          draft.montant_centimes != null &&
          draft.montant_centimes > 0 &&
          !existing.kinds.includes("montant")
        ) {
          next[draft.id] = {
            ...existing,
            kinds: [...existing.kinds, "montant"],
            montantEuros: formatMontantCentimesInput(draft.montant_centimes),
          };
        } else {
          next[draft.id] = existing;
        }
      }
      return next;
    });
  }, []);

  const reloadDrafts = useCallback(async (options?: { silent?: boolean }): Promise<PlacementOperation[]> => {
    const silent = options?.silent ?? draftsLoadedRef.current;
    if (!silent) setLoadingDrafts(true);
    try {
      const rows = await listPlacementOperationsForPipe(pipe.id);
      const nextDrafts = rows.filter(placementOperationIsSuiviDraft);
      setDrafts(nextDrafts);
      syncDraftFields(nextDrafts);
      draftsLoadedRef.current = true;
      return nextDrafts;
    } catch {
      if (!draftsLoadedRef.current) {
        setDrafts([]);
        setDraftOccurredAt({});
        setDraftContenu({});
      }
      return [];
    } finally {
      if (!silent) setLoadingDrafts(false);
    }
  }, [pipe.id, syncDraftFields]);

  useEffect(() => {
    void reloadDrafts();
    const debounceRef = { id: null as number | null };
    const onChanged = () => {
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
      debounceRef.id = window.setTimeout(() => {
        debounceRef.id = null;
        void reloadDrafts({ silent: true });
      }, PLACEMENT_RELOAD_DEBOUNCE_MS);
    };
    window.addEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
    return () => {
      window.removeEventListener(PLACEMENT_OPERATIONS_CHANGED_EVENT, onChanged);
      if (debounceRef.id != null) window.clearTimeout(debounceRef.id);
    };
  }, [reloadDrafts]);

  const showVersementInit =
    isVersementChild && !loadingDrafts && drafts.length === 0;

  useEffect(() => {
    if (showVersementInit) {
      setOpenNew(true);
      setStelliumLabel(VERSEMENT_COMPLEMENTAIRE_ACT_LABEL);
    }
  }, [showVersementInit]);

  const confirmStelliumSend = async (
    operation: PlacementOperation,
    options?: { occurredAt?: string; contenu?: string }
  ) => {
    const label = operation.stellium_label?.trim();
    const product = operation.product_label?.trim() ?? "";
    if (!label || pipe.contact_id <= 0) return;

    const versementComplementaire = isVersementComplementaireActLabel(label);
    const versementFromSuivi = versementComplementaire && variant === "suivi";
    const versementAffaireChild = versementComplementaire && isVersementChild;
    if (!versementComplementaire && !product) return;

    setSavingId(operation.id);
    try {
      const occurredAtUnix = datetimeLocalToUnix(options?.occurredAt ?? unixToDatetimeLocalInput());
      const journalTitre =
        versementComplementaire && !product ? label : `${label} — ${product}`;
      if (versementFromSuivi) {
        await timeline.addEntry({
          entry_type: "NOTE",
          titre: journalTitre,
          contenu: options?.contenu?.trim() || null,
          occurred_at: occurredAtUnix,
        });
        await createVersementAffaireFromSuivi(pipe, {
          productLabel: product || null,
          montantCentimes: operation.montant_centimes ?? null,
        });
        await dismissPlacementOperation(operation.id);
        notifyPlacementOperationsChanged();
        toast.success("Affaire versement créée — suivi Stellium actif sur l'affaire");
      } else {
        const entry = await timeline.addEntry({
          entry_type: "NOTE",
          titre: journalTitre,
          contenu: options?.contenu?.trim() || null,
          occurred_at: occurredAtUnix,
        });
        const investissementId = await resolveDraftInvestissementId(
          pipe.contact_id,
          label,
          product,
          operation.investissement_id
        );
        const vpMontantCentimes = isVpModificationStelliumAct(label)
          ? vpModificationMontantCentimesFromAct(draftVpModification[operation.id])
          : null;
        await createPlacementOperation({
          contact_id: pipe.contact_id,
          pipe_id: pipe.id,
          pipe_timeline_entry_id: entry.id,
          operation_type: placementOperationTypeFromStelliumLabel(label),
          stellium_label: label,
          product_label: product || null,
          montant_centimes: vpMontantCentimes ?? operation.montant_centimes ?? null,
          investissement_id: investissementId,
        });
        notifyPlacementOperationsChanged();
        toast.success(
          versementAffaireChild
            ? "Envoi Stellium confirmé — en attente de réponse partenaire"
            : "Envoi Stellium confirmé — en attente de réponse"
        );
      }
      const remainingDrafts = await reloadDrafts({ silent: true });
      if (remainingDrafts.length === 0) {
        onAdded?.();
      }
    } catch (err) {
      console.error(err);
      toast.error(String(err));
    } finally {
      setSavingId(null);
    }
  };

  const handleCreateDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    const label = stelliumLabel.trim();
    const product = productLabel.trim();
    if (!label || pipe.contact_id <= 0) return;

    const validationError =
      variant === "suivi"
        ? validateSuiviStelliumActInput({
            productLabel: product,
            actLabel: label,
            montantCentimes: parseMontantEurosToCentimes(montantEuros),
          })
        : variant === "affaire" && !isVersementChild
          ? !product || !isStelliumLabelAllowedForProduct(label, product, { affaire: true })
            ? "Produit requis pour la souscription partenaire."
            : !parseMontantEurosToCentimes(montantEuros)
              ? "Montant souscrit requis."
              : null
          : isVersementChild
            ? !product
              ? "Produit requis pour le versement complémentaire."
              : !parseMontantEurosToCentimes(montantEuros)
                ? "Montant souscrit requis."
                : null
          : !product || !isStelliumLabelAllowedForProduct(label, product)
            ? "Produit et acte requis."
            : !parseMontantEurosToCentimes(montantEuros)
              ? "Montant souscrit requis."
              : null;
    if (validationError) {
      toast.error(validationError);
      return;
    }
    setSavingId("new");
    try {
      const vpMontantCentimes = vpModificationMontantCentimesFromAct(newActVpModification);
      const remuneration = buildRemunerationPayload(product, montantEuros);
      const investissementId = await resolveDraftInvestissementId(
        pipe.contact_id,
        label,
        product
      );
      await createPlacementOperation({
        contact_id: pipe.contact_id,
        pipe_id: pipe.id,
        operation_type: placementOperationTypeFromStelliumLabel(label),
        stellium_label: label,
        product_label: product,
        montant_centimes: remuneration.montant_centimes ?? vpMontantCentimes,
        type_produit: remuneration.type_produit,
        investissement_id: investissementId,
      });
      notifyPlacementOperationsChanged();
      toast.success(copy.createSuccess);
      await reloadDrafts({ silent: true });
      setOpenNew(false);
      setStelliumLabel("");
      setProductLabel("");
      setMontantEuros("");
      setNewActVpModification({ ...EMPTY_VP_MODIFICATION_ACT_VALUE });
    } catch (err) {
      console.error(err);
      toast.error(String(err));
    } finally {
      setSavingId(null);
    }
  };

  const newActFicheEligible =
    variant === "suivi" &&
    isStelliumActEligibleForFicheConseil(stelliumLabel, productLabel);

  return (
    <div className="space-y-3 rounded-lg border bg-muted/15 p-4">
      <div>
        <p className="text-sm font-medium">{copy.title}</p>
        <p className="text-xs text-muted-foreground mt-0.5 leading-snug">{copy.description}</p>
        {isVersementChild && (
          <p className="text-xs text-muted-foreground mt-1 leading-snug">
            {showVersementInit
              ? "Renseignez le produit et le montant pour activer le suivi Stellium, puis confirmez l'envoi partenaire."
              : "Versement : confirmez l'envoi chez Stellium pour passer en attente partenaire."}
          </p>
        )}
      </div>

      {loadingDrafts ? (
        <p className="text-xs text-muted-foreground">Chargement…</p>
      ) : (
        <div className="space-y-3">
          {drafts.map((draft) => {
            const versementDraft =
              variant === "suivi" &&
              isVersementComplementaireActLabel(draft.stellium_label?.trim() ?? "");
            return (
            <div key={draft.id} className="rounded-md border bg-card p-3 space-y-3">
              <p className="text-sm font-medium">{formatDraftLabel(draft)}</p>
              {versementDraft ? (
                <p className="text-[11px] text-muted-foreground leading-snug">
                  Ouvre une affaire rattachée avec suivi Stellium versement à la création.
                </p>
              ) : null}
              <div className="space-y-2">
                <Label>
                  {versementDraft ? "Date" : "Date d'envoi chez Stellium"}
                </Label>
                <Input
                  type="datetime-local"
                  value={draftOccurredAt[draft.id] ?? defaultOccurredAt()}
                  onChange={(e) =>
                    setDraftOccurredAt((prev) => ({ ...prev, [draft.id]: e.target.value }))
                  }
                />
              </div>
              <DictationTextarea
                label="Détail (optionnel)"
                value={draftContenu[draft.id] ?? ""}
                onChange={(value) =>
                  setDraftContenu((prev) => ({ ...prev, [draft.id]: value }))
                }
                rows={2}
                placeholder="Montant, contexte…"
              />
              {isVpModificationStelliumAct(draft.stellium_label ?? "") ? (
                <VpModificationActFields
                  value={draftVpModification[draft.id] ?? { ...EMPTY_VP_MODIFICATION_ACT_VALUE }}
                  onChange={(value) =>
                    setDraftVpModification((prev) => ({ ...prev, [draft.id]: value }))
                  }
                  suggestMontantEuros={
                    draft.product_label?.trim() && pipe.contact_id > 0
                      ? () =>
                          loadVpModificationMontantEurosPrefill(
                            pipe.contact_id,
                            draft.product_label ?? ""
                          )
                      : undefined
                  }
                />
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                {variant === "suivi" &&
                isStelliumActEligibleForFicheConseil(
                  draft.stellium_label ?? "",
                  draft.product_label ?? ""
                ) ? (
                  <ArbitrageFicheConseilButton
                    disabled={ficheDisabled || savingId === draft.id}
                    onClick={() =>
                      startFicheConseilForStelliumAct(
                        pipe.contact_id,
                        draft.stellium_label ?? "",
                        draft.product_label ?? "",
                        {
                          suggestedInvestissementId:
                            draft.investissement_id ?? undefined,
                          vpModification: toVpModificationPdfFillInput(
                            draftVpModification[draft.id] ?? { ...EMPTY_VP_MODIFICATION_ACT_VALUE }
                          ),
                        }
                      )
                    }
                  />
                ) : null}
                <Button
                  type="button"
                  size="sm"
                  className="gap-1.5"
                  disabled={savingId === draft.id}
                  onClick={() =>
                    void confirmStelliumSend(draft, {
                      occurredAt: draftOccurredAt[draft.id],
                      contenu: draftContenu[draft.id],
                    })
                  }
                >
                  <Send className="h-3.5 w-3.5" />
                  {savingId === draft.id
                    ? "Enregistrement…"
                    : versementDraft
                      ? "Créer l'affaire versement"
                      : "Confirmer l'envoi Stellium"}
                </Button>
              </div>
            </div>
            );
          })}

          {!isVersementChild && !openNew ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1 text-xs"
              onClick={() => {
                setOpenNew(true);
                if (variant === "affaire") {
                  setStelliumLabel(AFFAIRE_STELLIUM_SOUSCRIPTION_LABEL);
                }
              }}
            >
              <Plus className="h-3.5 w-3.5" />
              {copy.addButton}
            </Button>
          ) : openNew || showVersementInit ? (
            <form onSubmit={(e) => void handleCreateDraft(e)} className="space-y-3 rounded-md border p-3">
              <StelliumPlacementActFields
                suivi={variant === "suivi"}
                affaire={variant === "affaire"}
                productLabel={productLabel}
                stelliumLabel={stelliumLabel}
                onProductChange={setProductLabel}
                onStelliumLabelChange={(label) => {
                  setStelliumLabel(label);
                  if (!isVpModificationStelliumAct(label)) {
                    setNewActVpModification({ ...EMPTY_VP_MODIFICATION_ACT_VALUE });
                  }
                }}
                versementInit={showVersementInit}
              />
              {newActNeedsMontant || showVersementInit ? (
                <PlacementMontantField value={montantEuros} onChange={setMontantEuros} />
              ) : newActIsVpModification ? (
                <VpModificationActFields
                  value={newActVpModification}
                  onChange={setNewActVpModification}
                  suggestMontantEuros={
                    productLabel.trim() && pipe.contact_id > 0
                      ? () =>
                          loadVpModificationMontantEurosPrefill(pipe.contact_id, productLabel)
                      : undefined
                  }
                />
              ) : null}
              <div className="flex flex-wrap justify-end gap-2">
                {newActFicheEligible ? (
                  <ArbitrageFicheConseilButton
                    disabled={ficheDisabled || savingId === "new"}
                    onClick={() => {
                      void (async () => {
                        const suggestedId = await resolveInvestissementIdForStelliumAct(
                          pipe.contact_id,
                          productLabel
                        );
                        startFicheConseilForStelliumAct(
                          pipe.contact_id,
                          stelliumLabel,
                          productLabel,
                          {
                            suggestedInvestissementId: suggestedId ?? undefined,
                            vpModification: toVpModificationPdfFillInput(newActVpModification),
                          }
                        );
                      })();
                    }}
                  />
                ) : null}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setOpenNew(false);
                    setStelliumLabel(showVersementInit ? VERSEMENT_COMPLEMENTAIRE_ACT_LABEL : "");
                    setProductLabel("");
                    setMontantEuros("");
                    setNewActVpModification({ ...EMPTY_VP_MODIFICATION_ACT_VALUE });
                  }}
                >
                  Annuler
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={
                    savingId === "new" ||
                    !stelliumLabel ||
                    (showVersementInit
                      ? !productLabel || !parseMontantEurosToCentimes(montantEuros)
                      : variant === "affaire"
                        ? !productLabel
                        : !isVersementComplementaireActLabel(stelliumLabel) && !productLabel)
                  }
                >
                  {savingId === "new" ? "Enregistrement…" : showVersementInit ? "Activer le suivi" : "Ajouter l'acte"}
                </Button>
              </div>
            </form>
          ) : null}
        </div>
      )}
      <ArbitrageFicheConseilDialogs hook={ficheConseil} />
    </div>
  );
}
