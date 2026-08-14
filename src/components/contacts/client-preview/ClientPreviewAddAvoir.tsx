import { useMemo, useState } from "react";
import {
  AVOIR_PANIERS,
  AVOIR_TYPES_PAR_PANIER,
  optionAvoirParValeur,
  panierEstImmobilier,
  panierEstMeubles,
  type AvoirPanier,
} from "@/lib/espace-client/client-avoir-catalogue";
import {
  validateClientAvoirDeclaration,
  type ClientAvoirDeclarationInput,
} from "@/lib/espace-client/client-avoir-declaration";
import { parseEurosInput } from "@/lib/espace-client/client-investissement-update";
import { PLAFOND_DECLARATION_CENTIMES } from "@/lib/espace-client/scpi-client-tracking";
import { CP } from "./client-preview-theme";

const INPUT_CLASS =
  "mt-1 w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface)] px-3 py-2 text-sm text-[var(--cp-ink)]";

const NOM_PLACEHOLDER: Record<AvoirPanier, string> = {
  immobilier: "Ex. Bouygues Immobilier",
  scpi: "Ex. Corum",
  placements: "Ex. Swisslife",
  epargne: "Ex. Livret A",
  meubles: "Ex. tableau, enseigne…",
};

const ERROR_LABEL: Record<string, string> = {
  panier_invalide: "Choisissez une catégorie.",
  type_invalide: "Choisissez un type de produit.",
  nom_invalide: "Indiquez le nom du produit (2 caractères minimum).",
  valorisation_invalide: `Indiquez une valorisation actuelle valide (max. ${(PLAFOND_DECLARATION_CENTIMES / 100).toLocaleString("fr-FR")} €).`,
  date_souscription_invalide: "Date de souscription invalide.",
  date_future: "La date de souscription ne peut pas être dans le futur.",
  loyer_invalide: "Indiquez un loyer mensuel valide.",
  mensualite_invalide: "Indiquez une mensualité de crédit valide.",
  date_fin_pret_invalide: "Indiquez une date de fin de prêt valide.",
};

function dateFieldLabel(panier: AvoirPanier): string {
  if (panierEstImmobilier(panier)) return "Date d'acquisition — optionnel";
  if (panierEstMeubles(panier)) return "Date — optionnel";
  return "Date de souscription — optionnel";
}

function errorMessage(code: string, panier: AvoirPanier | ""): string {
  if (panier && panierEstImmobilier(panier)) {
    if (code === "date_souscription_invalide") {
      return "Date d'acquisition invalide.";
    }
    if (code === "date_future") {
      return "La date d'acquisition ne peut pas être dans le futur.";
    }
  }
  return ERROR_LABEL[code] ?? "Saisie invalide.";
}

export interface ClientPreviewAddAvoirProps {
  submitting?: boolean;
  onSubmit?: (input: ClientAvoirDeclarationInput) => Promise<void>;
}

export function ClientPreviewAddAvoir({
  submitting = false,
  onSubmit,
}: ClientPreviewAddAvoirProps) {
  const [open, setOpen] = useState(false);
  const [panier, setPanier] = useState<AvoirPanier | "">("");
  const [valeurType, setValeurType] = useState("");
  const [typeProduit, setTypeProduit] = useState("");
  const [nomProduit, setNomProduit] = useState("");
  const [valorisation, setValorisation] = useState("");
  const [dateSouscription, setDateSouscription] = useState("");
  const [loyer, setLoyer] = useState("");
  const [mensualite, setMensualite] = useState("");
  const [dateFinPret, setDateFinPret] = useState("");
  const [error, setError] = useState<string | null>(null);

  const types = useMemo(
    () => (panier ? AVOIR_TYPES_PAR_PANIER[panier] : []),
    [panier]
  );
  const optionChoisie = panier && valeurType
    ? optionAvoirParValeur(panier, valeurType)
    : undefined;
  const nomImplicite = optionChoisie?.nomImplicite ?? null;

  const reset = () => {
    setPanier("");
    setValeurType("");
    setTypeProduit("");
    setNomProduit("");
    setValorisation("");
    setDateSouscription("");
    setLoyer("");
    setMensualite("");
    setDateFinPret("");
    setError(null);
  };

  const handlePanier = (value: string) => {
    setPanier((value || "") as AvoirPanier | "");
    setValeurType("");
    setTypeProduit("");
    setNomProduit("");
    setLoyer("");
    setMensualite("");
    setDateFinPret("");
    setError(null);
  };

  const handleType = (valeur: string) => {
    setValeurType(valeur);
    const option = types.find((o) => (o.valeurOption ?? o.typeProduit) === valeur);
    setTypeProduit(option?.typeProduit ?? "");
    setNomProduit("");
    setError(null);
  };

  const handleSubmit = async () => {
    if (!onSubmit) return;
    const validated = validateClientAvoirDeclaration({
      panier,
      typeProduit,
      nomProduit: nomImplicite ?? nomProduit.trim(),
      valorisationCentimes: parseEurosInput(valorisation),
      dateSouscription: dateSouscription || null,
      loyerMensuelCentimes: loyer.trim() ? parseEurosInput(loyer) : null,
      mensualiteCreditCentimes: mensualite.trim()
        ? parseEurosInput(mensualite)
        : null,
      dateFinPret: dateFinPret || null,
    });
    if (typeof validated === "string") {
      setError(errorMessage(validated, panier));
      return;
    }
    setError(null);
    try {
      await onSubmit({
        panier: validated.panier,
        typeProduit: validated.typeProduit,
        nomProduit: validated.nomProduit,
        valorisationCentimes: validated.valorisationCentimes,
        dateSouscription: validated.dateSouscription,
        loyerMensuelCentimes: validated.loyerMensuelCentimes,
        mensualiteCreditCentimes: validated.mensualiteCreditCentimes,
        dateFinPret: validated.dateFinPret,
      });
      reset();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Enregistrement impossible.");
    }
  };

  return (
    <div className="mt-5">
      {open ? (
        <div className={`${CP.card} p-4`}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <p className={CP.body}>Ajouter un avoir</p>
            <button
              type="button"
              className={`${CP.caption} underline-offset-2 hover:underline`}
              onClick={() => {
                reset();
                setOpen(false);
              }}
            >
              Annuler
            </button>
          </div>
          <div className="space-y-3">
            <label className="block">
              <span className={CP.meta}>Catégorie</span>
              <select
                value={panier}
                onChange={(e) => handlePanier(e.target.value)}
                className={INPUT_CLASS}
              >
                <option value="">Choisir…</option>
                {AVOIR_PANIERS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>
            </label>
            {panier ? (
              <label className="block">
                <span className={CP.meta}>Type de produit</span>
                <select
                  value={valeurType}
                  onChange={(e) => handleType(e.target.value)}
                  className={INPUT_CLASS}
                >
                  <option value="">Choisir…</option>
                  {types.map((opt, index) => (
                    <option
                      key={`${opt.valeurOption ?? opt.typeProduit}-${index}`}
                      value={opt.valeurOption ?? opt.typeProduit}
                    >
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            {panier && !nomImplicite ? (
              <label className="block">
                <span className={CP.meta}>Nom du produit</span>
                <input
                  type="text"
                  value={nomProduit}
                  onChange={(e) => setNomProduit(e.target.value)}
                  placeholder={NOM_PLACEHOLDER[panier]}
                  maxLength={80}
                  className={INPUT_CLASS}
                />
              </label>
            ) : null}
            {panier ? (
              <>
                <label className="block">
                  <span className={CP.meta}>Valorisation actuelle (€)</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valorisation}
                    onChange={(e) => setValorisation(e.target.value)}
                    className={`${INPUT_CLASS} tabular-nums`}
                  />
                </label>
                <label className="block">
                  <span className={CP.meta}>{dateFieldLabel(panier)}</span>
                  <input
                    type="date"
                    value={dateSouscription}
                    onChange={(e) => setDateSouscription(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </>
            ) : null}
            {panier === "immobilier" ? (
              <>
                <label className="block">
                  <span className={CP.meta}>Loyer mensuel (€) — optionnel</span>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={loyer}
                    onChange={(e) => setLoyer(e.target.value)}
                    className={`${INPUT_CLASS} tabular-nums`}
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
                    className={`${INPUT_CLASS} tabular-nums`}
                  />
                </label>
                <label className="block">
                  <span className={CP.meta}>Fin de prêt — optionnel</span>
                  <input
                    type="date"
                    value={dateFinPret}
                    onChange={(e) => setDateFinPret(e.target.value)}
                    className={INPUT_CLASS}
                  />
                </label>
              </>
            ) : null}
            {error ? (
              <p className={`${CP.caption} text-red-400`}>{error}</p>
            ) : null}
            <button
              type="button"
              disabled={submitting || !onSubmit}
              onClick={() => void handleSubmit()}
              className="w-full rounded-lg border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-2.5 text-sm text-[var(--cp-ink)] transition-colors hover:border-[var(--cp-ink-muted)] disabled:opacity-60"
            >
              {submitting ? "Enregistrement…" : "Enregistrer"}
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="w-full rounded-xl border border-[var(--cp-line)] bg-[var(--cp-surface-raised)] px-3 py-3 text-sm text-[var(--cp-ink)] transition-colors hover:border-[var(--cp-ink-muted)]"
        >
          Ajouter un avoir
        </button>
      )}
    </div>
  );
}
