import { useMemo, useState } from "react";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  getClientInvestissementUpdateKind,
  validateClientInvestissementUpdate,
  type ClientInvestissementUpdateInput,
  type ClientInvestissementUpdateKind,
} from "@/lib/espace-client/client-investissement-update";
import {
  defaultValorisationCentimes,
  PLAFOND_DECLARATION_CENTIMES,
} from "@/lib/espace-client/scpi-client-tracking";
import { todayLocal } from "@/lib/contacts/contact-form-utils";
import { getPlacementValorisationUiMode } from "@/lib/investissements/investissement-encours";
import { CP } from "./client-preview-theme";

function eurosToCentimes(value: string): number {
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 100);
}

function centimesToEurosInput(centimes: number): string {
  if (centimes <= 0) return "";
  return (centimes / 100).toFixed(2).replace(".", ",");
}

function unixToDateInput(unix?: number | null): string {
  if (unix == null || unix <= 0) return "";
  const d = new Date(unix * 1000);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface ClientPreviewScpiDeclarationFormProps {
  inv: Investissement;
  history?: Array<{ dateTs: number; montantCentimes: number }>;
  submitting?: boolean;
  onSubmit: (input: ClientInvestissementUpdateInput) => Promise<void>;
}

export function ClientPreviewScpiDeclarationForm({
  inv,
  history,
  submitting = false,
  onSubmit,
}: ClientPreviewScpiDeclarationFormProps) {
  const kind: ClientInvestissementUpdateKind | null = useMemo(
    () => getClientInvestissementUpdateKind(inv),
    [inv]
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

  if (!kind) return null;

  const handleSubmit = async () => {
    const valorisationCentimes = eurosToCentimes(valorisation);
    const input: ClientInvestissementUpdateInput = {
      investissementId: inv.id,
      date,
      valorisationCentimes,
    };

    if (kind === "scpi") {
      input.revenuPercuCentimes = revenu.trim()
        ? eurosToCentimes(revenu)
        : null;
    }
    if (kind === "immobilier") {
      // Comme le revenu SCPI : une valeur saisie (y compris 0) est posée.
      // Champ vidé = 0 € (plus de loyer / plus de crédit), pas « ne pas toucher »,
      // sinon on ne pourrait jamais effacer un loyer déjà en base.
      input.loyerMensuelCentimes = loyer.trim()
        ? eurosToCentimes(loyer)
        : 0;
      input.mensualiteCreditCentimes = mensualite.trim()
        ? eurosToCentimes(mensualite)
        : 0;
      input.dateFinPret = dateFinPret;
    }

    const validation = validateClientInvestissementUpdate(inv, input);

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
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Enregistrement impossible. Réessayez dans un instant."
      );
      return;
    }
    setRevenu("");
  };

  return (
    <div className="border-t border-[var(--cp-line-soft)] pt-4">
      <p className={`${CP.body} font-medium`}>Mettre à jour</p>
      <p className={`${CP.caption} mt-1`}>
        {kind === "immobilier"
          ? "Enregistrez la valorisation à cette date, et corrigez le cas échéant le loyer, la mensualité ou la fin de prêt."
          : kind === "scpi"
            ? "Enregistrez la valorisation à cette date et, le cas échéant, le revenu perçu (dividendes)."
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

        {error ? (
          <p className={`${CP.caption} text-red-400`}>{error}</p>
        ) : null}

        <button
          type="button"
          disabled={submitting}
          onClick={() => void handleSubmit()}
          className="w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-2.5 text-sm text-[var(--cp-ink)] transition-colors hover:border-[var(--cp-ink-muted)] disabled:opacity-60"
        >
          {submitting ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}
