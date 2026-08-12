import { useMemo, useState } from "react";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  defaultValorisationCentimes,
  validateScpiClientDeclaration,
  PLAFOND_DECLARATION_CENTIMES,
  type ScpiClientDeclarationInput,
} from "@/lib/espace-client/scpi-client-tracking";
import { todayLocal } from "@/lib/contacts/contact-form-utils";
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

export interface ClientPreviewScpiDeclarationFormProps {
  inv: Investissement;
  history?: Array<{ dateTs: number; montantCentimes: number }>;
  submitting?: boolean;
  onSubmit: (input: ScpiClientDeclarationInput) => Promise<void>;
}

export function ClientPreviewScpiDeclarationForm({
  inv,
  history,
  submitting = false,
  onSubmit,
}: ClientPreviewScpiDeclarationFormProps) {
  const defaultValorisation = useMemo(
    () => defaultValorisationCentimes(inv, history),
    [inv, history]
  );

  const [date, setDate] = useState(todayLocal());
  const [valorisation, setValorisation] = useState(
    centimesToEurosInput(defaultValorisation)
  );
  const [revenu, setRevenu] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async () => {
    const valorisationCentimes = eurosToCentimes(valorisation);
    const revenuCentimes = revenu.trim() ? eurosToCentimes(revenu) : null;
    const validation = validateScpiClientDeclaration(inv, {
      investissementId: inv.id,
      date,
      valorisationCentimes,
      revenuPercuCentimes: revenuCentimes,
    });

    if (typeof validation === "string") {
      switch (validation) {
        case "date_future":
          setError("La date ne peut pas être dans le futur.");
          break;
        case "valorisation_invalide":
          setError(
            valorisationCentimes > PLAFOND_DECLARATION_CENTIMES
              ? "Le montant dépasse 10 000 000 € : vérifiez votre saisie."
              : "Indiquez une valorisation valide."
          );
          break;
        case "revenu_invalide":
          setError(
            (revenuCentimes ?? 0) > PLAFOND_DECLARATION_CENTIMES
              ? "Le revenu dépasse 10 000 000 € : vérifiez votre saisie."
              : "Indiquez un revenu perçu valide."
          );
          break;
        default:
          setError("Saisie invalide.");
      }
      return;
    }

    setError(null);
    try {
      await onSubmit({
        investissementId: inv.id,
        date,
        valorisationCentimes: validation.valorisationCentimes,
        revenuPercuCentimes: validation.revenuPercuCentimes,
      });
    } catch (err) {
      // Sans ce message, un refus du serveur laisserait le bouton revenir à
      // « Enregistrer » : le client croirait sa saisie prise en compte.
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
        Enregistrez la valorisation à cette date et, le cas échéant, le revenu
        perçu (dividendes).
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
          <span className={CP.meta}>Valorisation (€)</span>
          <input
            type="text"
            inputMode="decimal"
            value={valorisation}
            onChange={(e) => setValorisation(e.target.value)}
            className="mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm tabular-nums text-[var(--cp-ink)]"
          />
        </label>

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
