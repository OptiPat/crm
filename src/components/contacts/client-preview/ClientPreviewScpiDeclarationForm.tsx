import { useMemo, useState } from "react";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  buildClientInvestissementUpdateInput,
  getClientInvestissementUpdateKind,
  isClientInvestissementFormDirty,
  parseEurosInput as eurosToCentimes,
  planClientPlacementSubmit,
  unixToDateInput,
  validateClientInvestissementUpdate,
  type ClientInvestissementNature,
  type ClientInvestissementUpdateInput,
  type ClientInvestissementUpdateKind,
} from "@/lib/espace-client/client-investissement-update";
import {
  defaultValorisationCentimes,
  PLAFOND_DECLARATION_CENTIMES,
} from "@/lib/espace-client/scpi-client-tracking";
import { todayLocal } from "@/lib/contacts/contact-form-utils";
import { getPlacementValorisationUiMode } from "@/lib/investissements/investissement-encours";
import { extranetBookmarkDelta } from "@/lib/espace-client/client-extranet-bookmark";
import { CP } from "./client-preview-theme";
import {
  ClientPreviewExtranetBookmarkField,
  EXTRANET_BOOKMARK_ERROR,
} from "./ClientPreviewExtranetBookmark";

const EXTRANET_AFTER_VALORISATION_ERROR =
  "La mise à jour a été enregistrée, mais le lien n'a pas pu l'être. Réessayez.";

function submitErrorMessage(err: unknown): string {
  return err instanceof Error && err.message
    ? err.message
    : "Enregistrement impossible. Réessayez dans un instant.";
}

function centimesToEurosInput(centimes: number): string {
  if (centimes <= 0) return "";
  return (centimes / 100).toFixed(2).replace(".", ",");
}

export interface ClientPreviewScpiDeclarationFormProps {
  inv: Investissement;
  /** Nature annoncée par la photo ; absente dans l'aperçu conseiller. */
  nature?: ClientInvestissementNature;
  history?: Array<{ dateTs: number; montantCentimes: number }>;
  submitting?: boolean;
  onSubmit: (input: ClientInvestissementUpdateInput) => Promise<void>;
  extranetUrl?: string | null;
  extranetSubmitting?: boolean;
  onSaveExtranet?: (url: string | null) => Promise<void>;
}

export function ClientPreviewScpiDeclarationForm({
  inv,
  nature,
  history,
  submitting = false,
  onSubmit,
  extranetUrl,
  extranetSubmitting = false,
  onSaveExtranet,
}: ClientPreviewScpiDeclarationFormProps) {
  const kind: ClientInvestissementUpdateKind | null = useMemo(
    () => getClientInvestissementUpdateKind(inv, nature),
    [inv, nature]
  );
  const uiMode = getPlacementValorisationUiMode(inv.type_produit);
  const amountLabel =
    uiMode === "encours" ? "Encours (€)" : "Valorisation (€)";

  const defaultValorisation = useMemo(
    () => defaultValorisationCentimes(inv, history),
    [inv, history]
  );

  const [date, setDate] = useState(todayLocal());
  const [valorisation, setValorisation] = useState(
    centimesToEurosInput(defaultValorisation)
  );
  const [revenu, setRevenu] = useState("");
  const [loyer, setLoyer] = useState(
    centimesToEurosInput(inv.loyer_mensuel ?? 0)
  );
  const [mensualite, setMensualite] = useState(
    centimesToEurosInput(inv.mensualite_credit ?? 0)
  );
  const [dateFinPret, setDateFinPret] = useState(
    unixToDateInput(inv.date_fin_pret)
  );
  const [error, setError] = useState<string | null>(null);
  const [extranetDraft, setExtranetDraft] = useState(extranetUrl ?? "");
  const [postedFieldsKey, setPostedFieldsKey] = useState<string | null>(null);
  const busy = submitting || extranetSubmitting;
  const fieldsKey = [valorisation, revenu, loyer, mensualite, dateFinPret].join(
    "\0"
  );

  if (!kind) return null;

  const handleSubmit = async () => {
    const amountsDirty = isClientInvestissementFormDirty(
      inv,
      { date, valorisation, revenu, loyer, mensualite, dateFinPret },
      { valorisationCentimes: defaultValorisation },
      nature
    );
    const alreadyPosted = postedFieldsKey === fieldsKey;
    const formDirty = amountsDirty && !alreadyPosted;
    const extranetDelta = onSaveExtranet
      ? extranetBookmarkDelta(extranetDraft, extranetUrl)
      : null;
    const plan = planClientPlacementSubmit({
      formDirty,
      alreadyPosted,
      extranetDelta,
    });

    if (plan.kind === "noop") {
      setError(null);
      return;
    }
    if (plan.kind === "extranet_error") {
      setError(EXTRANET_BOOKMARK_ERROR);
      return;
    }
    if (plan.kind === "extranet_only") {
      setError(null);
      try {
        await onSaveExtranet?.(plan.url);
      } catch (err) {
        setError(submitErrorMessage(err));
      }
      return;
    }

    const valorisationCentimes = eurosToCentimes(valorisation);
    // Seuls les champs réellement modifiés partent : voir
    // buildClientInvestissementUpdateInput.
    const input = buildClientInvestissementUpdateInput(
      inv,
      { date, valorisation, revenu, loyer, mensualite, dateFinPret },
      nature
    );

    const validation = validateClientInvestissementUpdate(
      inv,
      input,
      undefined,
      nature
    );

    if (typeof validation === "string") {
      switch (validation) {
        case "date_future":
          setError("La date ne peut pas être dans le futur.");
          break;
        case "valorisation_invalide":
          setError(
            valorisationCentimes > PLAFOND_DECLARATION_CENTIMES
              ? "Le montant dépasse 10 000 000 € : vérifiez votre saisie."
              : `Indiquez une ${uiMode === "encours" ? "valeur d'encours" : "valorisation"} valide.`
          );
          break;
        case "revenu_invalide":
          setError(
            eurosToCentimes(revenu) > PLAFOND_DECLARATION_CENTIMES
              ? "Le revenu dépasse 10 000 000 € : vérifiez votre saisie."
              : "Indiquez un revenu perçu valide."
          );
          break;
        case "loyer_invalide":
          setError("Indiquez un loyer mensuel valide.");
          break;
        case "mensualite_invalide":
          setError("Indiquez une mensualité de crédit valide.");
          break;
        case "date_fin_pret_invalide":
          setError("Indiquez une date de fin de prêt valide.");
          break;
        default:
          setError("Saisie invalide.");
      }
      return;
    }

    setError(null);
    try {
      await onSubmit(input);
    } catch (err) {
      setError(submitErrorMessage(err));
      return;
    }
    setPostedFieldsKey(
      [valorisation, "", loyer, mensualite, dateFinPret].join("\0")
    );
    setRevenu("");

    if (plan.warnExtranetInvalid) {
      setError(EXTRANET_BOOKMARK_ERROR);
      return;
    }
    if (plan.extranet !== undefined) {
      try {
        await onSaveExtranet?.(plan.extranet);
      } catch {
        setError(EXTRANET_AFTER_VALORISATION_ERROR);
      }
    }
  };

  return (
    <div className="border-t border-[var(--cp-line-soft)] pt-4">
      <p className={`${CP.body} font-medium`}>Mettre à jour</p>
      <p className={`${CP.caption} mt-1`}>
        {kind === "immobilier"
          ? "Enregistrez la valorisation à cette date, et corrigez le cas échéant le loyer, la mensualité ou la fin de prêt."
          : kind === "scpi"
            ? "Enregistrez la valorisation à cette date et, le cas échéant, le revenu perçu (dividendes)."
            : uiMode === "valorisation"
              ? "Enregistrez la valorisation à cette date."
              : "Enregistrez l'encours à cette date."}
      </p>

      <div className="mt-4 space-y-3">
        <label className="block">
          <span className={CP.meta}>Date</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm text-[var(--cp-ink)]"
          />
        </label>

        <label className="block">
          <span className={CP.meta}>{amountLabel}</span>
          <input
            type="text"
            inputMode="decimal"
            value={valorisation}
            onChange={(e) => setValorisation(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm tabular-nums text-[var(--cp-ink)]"
          />
        </label>

        {kind === "scpi" ? (
          <label className="block">
            <span className={CP.meta}>Revenu perçu (€) — optionnel</span>
            <input
              type="text"
              inputMode="decimal"
              value={revenu}
              onChange={(e) => setRevenu(e.target.value)}
              placeholder="Ex. 300"
              className="mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm tabular-nums text-[var(--cp-ink)]"
            />
          </label>
        ) : null}

        {kind === "immobilier" ? (
          <>
            <label className="block">
              <span className={CP.meta}>Loyer mensuel (€) — optionnel</span>
              <input
                type="text"
                inputMode="decimal"
                value={loyer}
                onChange={(e) => setLoyer(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm tabular-nums text-[var(--cp-ink)]"
              />
            </label>
            <label className="block">
              <span className={CP.meta}>
                Mensualité de crédit (€) — optionnel
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={mensualite}
                onChange={(e) => setMensualite(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm tabular-nums text-[var(--cp-ink)]"
              />
            </label>
            <label className="block">
              <span className={CP.meta}>Fin de prêt — optionnel</span>
              <input
                type="date"
                value={dateFinPret}
                onChange={(e) => setDateFinPret(e.target.value)}
                className="mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm text-[var(--cp-ink)]"
              />
            </label>
          </>
        ) : null}

        {onSaveExtranet ? (
          <ClientPreviewExtranetBookmarkField
            draft={extranetDraft}
            onDraftChange={(value) => {
              setExtranetDraft(value);
              setError(null);
            }}
            savedUrl={extranetUrl}
          />
        ) : null}

        {error ? (
          <p className={`${CP.caption} text-red-400`}>{error}</p>
        ) : null}

        <button
          type="button"
          disabled={busy}
          onClick={() => void handleSubmit()}
          className="w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-2.5 text-sm text-[var(--cp-ink)] transition-colors hover:border-[var(--cp-ink-muted)] disabled:opacity-60"
        >
          {busy ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
