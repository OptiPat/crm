import { X } from "lucide-react";
import { createPortal } from "react-dom";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import {
  formatNomProduit,
  IMMOBILIER_TYPES,
} from "@/lib/investissements/investissement-display";
import { isDeclareClientOrigine } from "@/lib/investissements/investissement-origine";
import { isScpiCreditEligibleType } from "@/lib/investissements/investissement-scpi-reinvest";
import { hasActiveVersementProgramme } from "@/lib/investissements/investissement-versements";
import { formatShortEuro } from "./client-preview-format";
import { CP } from "./client-preview-theme";
import type { EvolutionHistoryById } from "./ClientPreviewEvolution";
import {
  isScpiClientTrackingEligible,
  type ScpiClientDeclarationInput,
} from "@/lib/espace-client/scpi-client-tracking";
import { isClientPreviewValorisationHistoryEligible } from "@/lib/investissements/investissement-encours";
import { ClientPreviewPlacementValorisation } from "./ClientPreviewPlacementValorisation";
import { ClientPreviewScpiDeclarationForm } from "./ClientPreviewScpiDeclarationForm";
import { useClientPreviewOverlayPortal } from "./client-preview-overlay";

const IMMOBILIER_SET = new Set<string>(IMMOBILIER_TYPES);

const DECLARE_BADGE_TITLE =
  "Non vérifié par le cabinet — saisi par le client dans son espace";

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2.5">
      <span className={CP.meta}>{label}</span>
      <span className={`${CP.body} text-right tabular-nums`}>{value}</span>
    </div>
  );
}

function formatFrequenceVersement(freq?: string | null): string | null {
  if (!freq) return null;
  switch (freq) {
    case "MENSUEL":
      return "mensuel";
    case "TRIMESTRIEL":
      return "trimestriel";
    default:
      return freq.toLowerCase();
  }
}

function formatVersementProgramme(inv: Investissement): string | null {
  if (!hasActiveVersementProgramme(inv)) return null;
  const amount = formatShortEuro(inv.montant_versement_programme!);
  const freq = formatFrequenceVersement(inv.frequence_versement);
  return freq ? `${amount} (${freq})` : amount;
}

function formatReinvestissement(inv: Investissement): string | null {
  if (!inv.reinvestissement_dividendes) return null;
  const match = inv.notes?.match(/(\d+)\s*%/);
  const pct = match?.[1] ?? "100";
  return `${pct} % des dividendes`;
}

export interface ClientPreviewPlacementDetailProps {
  inv: Investissement;
  partenaire?: Partenaire;
  valorisationHistoriesByInvestissementId?: EvolutionHistoryById;
  enableScpiTracking?: boolean;
  scpiDeclarationSubmitting?: boolean;
  onSubmitScpiDeclaration?: (
    input: ScpiClientDeclarationInput
  ) => Promise<void>;
  onClose: () => void;
}

export function ClientPreviewPlacementDetail({
  inv,
  partenaire,
  valorisationHistoriesByInvestissementId,
  enableScpiTracking = false,
  scpiDeclarationSubmitting = false,
  onSubmitScpiDeclaration,
  onClose,
}: ClientPreviewPlacementDetailProps) {
  const overlayPortal = useClientPreviewOverlayPortal();
  const inFrame = overlayPortal != null;
  /**
   * Toujours centrée, quelle que soit la hauteur du contenu. En feuille collée
   * au bas de l'écran, une fiche courte (immobilier, épargne bancaire) se
   * tassait dans un coin quand une fiche longue (placements financiers, SCPI)
   * paraissait centrée : la fenêtre semblait sauter d'un placement à l'autre.
   */
  const sheetShape = "max-h-[85dvh] rounded-2xl";
  const label = inv.nom_produit || formatNomProduit(inv.type_produit);
  const typeLabel = formatNomProduit(inv.type_produit);
  const declared = isDeclareClientOrigine(inv.origine);
  const showCreditBlock =
    IMMOBILIER_SET.has(inv.type_produit) ||
    isScpiCreditEligibleType(inv.type_produit);
  const hasMensualite =
    inv.mensualite_credit != null && inv.mensualite_credit > 0;
  const hasLoyer = inv.loyer_mensuel != null && inv.loyer_mensuel > 0;
  const vpLabel = formatVersementProgramme(inv);
  const reinvestLabel = formatReinvestissement(inv);
  const showValorisationHistory = isClientPreviewValorisationHistoryEligible(
    inv.type_produit
  );
  const valorisationHistory = valorisationHistoriesByInvestissementId?.get(
    inv.id
  );
  // La fusion des deux sources est faite en amont, une seule fois, par
  // buildValorisationHistories : la refaire ici les laisserait diverger.
  const mergedHistory = valorisationHistory ?? [];
  const canTrackScpi =
    enableScpiTracking && isScpiClientTrackingEligible(inv);

  return createPortal(
    <div
      className={`cp-layer ${inFrame ? "absolute" : "fixed"} inset-0 z-50 flex items-center justify-center px-3`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="cp-placement-detail-title"
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/55"
        aria-label="Fermer"
        onClick={onClose}
      />
      <div
        className={`${CP.card} relative z-10 flex w-full max-w-lg flex-col overflow-hidden ${sheetShape}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--cp-line-soft)] px-5 py-4">
          <div className="min-w-0">
            <p id="cp-placement-detail-title" className={`${CP.body} font-medium`}>
              {label}
            </p>
            {partenaire ? (
              <p className={`${CP.caption} mt-0.5`}>{partenaire.raison_sociale}</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-[var(--cp-ink-muted)] transition-colors hover:bg-[var(--cp-surface-raised)] hover:text-[var(--cp-ink)]"
            aria-label="Fermer"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-2">
          <div className="divide-y divide-[var(--cp-line-soft)]">
            <DetailRow label="Type d'investissement" value={typeLabel} />
            {showCreditBlock && hasMensualite ? (
              <DetailRow
                label="Mensualité de crédit"
                value={`${formatShortEuro(inv.mensualite_credit!)} / mois`}
              />
            ) : null}
            {showCreditBlock && hasLoyer ? (
              <DetailRow
                label="Loyer mensuel"
                value={`${formatShortEuro(inv.loyer_mensuel!)} / mois`}
              />
            ) : null}
            {vpLabel ? (
              <DetailRow label="Versement programmé" value={vpLabel} />
            ) : null}
            {reinvestLabel ? (
              <DetailRow label="Réinvestissement" value={reinvestLabel} />
            ) : null}
            {declared ? (
              <div className="py-2.5">
                <span className={CP.badge} title={DECLARE_BADGE_TITLE}>
                  Déclaré par vous
                </span>
              </div>
            ) : null}
            {showValorisationHistory ? (
              <ClientPreviewPlacementValorisation
                inv={inv}
                history={mergedHistory}
              />
            ) : null}
            {canTrackScpi && onSubmitScpiDeclaration ? (
              <ClientPreviewScpiDeclarationForm
                inv={inv}
                history={mergedHistory}
                submitting={scpiDeclarationSubmitting}
                onSubmit={onSubmitScpiDeclaration}
              />
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    inFrame ? overlayPortal : document.body
  );
}
