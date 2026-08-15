import { useState } from "react";
import { X } from "lucide-react";
import { createPortal } from "react-dom";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import {
  formatNomProduit,
  IMMOBILIER_TYPES,
} from "@/lib/investissements/investissement-display";
import { isScpiCreditEligibleType } from "@/lib/investissements/investissement-scpi-reinvest";
import { hasActiveVersementProgramme } from "@/lib/investissements/investissement-versements";
import { formatShortEuro } from "./client-preview-format";
import { CP } from "./client-preview-theme";
import type { EvolutionHistoryById } from "./ClientPreviewEvolution";
import {
  isClientInvestissementUpdateEligible,
  type ClientInvestissementNature,
  type ClientInvestissementUpdateInput,
} from "@/lib/espace-client/client-investissement-update";
import { inventoryRowLabels } from "@/lib/espace-client/client-inventory-labels";
import { canClientRetirerAvoir } from "@/lib/espace-client/client-avoir-retrait";
import { isClientPreviewValorisationHistoryEligible } from "@/lib/investissements/investissement-encours";
import { ClientPreviewPlacementValorisation } from "./ClientPreviewPlacementValorisation";
import { ClientPreviewScpiDeclarationForm } from "./ClientPreviewScpiDeclarationForm";
import { ClientPreviewExtranetBookmark } from "./ClientPreviewExtranetBookmark";
import { isExtranetBookmarkEligible } from "@/lib/espace-client/client-extranet-bookmark";
import { useClientPreviewOverlayPortal } from "./client-preview-overlay";

const IMMOBILIER_SET = new Set<string>(IMMOBILIER_TYPES);

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
  /** Nature annoncée par la photo ; absente dans l'aperçu conseiller. */
  nature?: ClientInvestissementNature;
  enableScpiTracking?: boolean;
  scpiDeclarationSubmitting?: boolean;
  onSubmitScpiDeclaration?: (
    input: ClientInvestissementUpdateInput
  ) => Promise<void>;
  enableRetirerAvoir?: boolean;
  retirerSubmitting?: boolean;
  onRetirerAvoir?: (investissementId: number) => Promise<void>;
  extranetUrl?: string | null;
  extranetSubmitting?: boolean;
  onSaveExtranet?: (investissementId: number, url: string | null) => Promise<void>;
  onClose: () => void;
}

export function ClientPreviewPlacementDetail({
  inv,
  partenaire,
  valorisationHistoriesByInvestissementId,
  nature,
  enableScpiTracking = false,
  scpiDeclarationSubmitting = false,
  onSubmitScpiDeclaration,
  enableRetirerAvoir = false,
  retirerSubmitting = false,
  onRetirerAvoir,
  extranetUrl,
  extranetSubmitting = false,
  onSaveExtranet,
  onClose,
}: ClientPreviewPlacementDetailProps) {
  const overlayPortal = useClientPreviewOverlayPortal();
  const inFrame = overlayPortal != null;
  /**
   * Toujours centrée, quelle que soit la hauteur du contenu. En feuille collée
   * au bas de l'écran, une fiche courte (immobilier, épargne bancaire) se
   * tassait dans un coin quand une fiche longue (placements financiers, SCPI)
   * paraissait centrée : la fenêtre semblait sauter d'un placement à l'autre.
   *
   * Dans le cadre simulateur CRM, 85dvh dépasse l'écran du téléphone (≈78vh) :
   * haut et bas sont coupés (titre + bouton Enregistrer). On borne alors à
   * 100 % du cadre ; sur le portail réel, on garde 85dvh du viewport.
   * min-h-0 : sans lui le flex refuse de rétrécir sous la hauteur du contenu.
   */
  const sheetShape = inFrame
    ? "max-h-full min-h-0 rounded-2xl"
    : "max-h-[85dvh] rounded-2xl";
  const { title } = inventoryRowLabels({
    typeProduit: inv.type_produit,
    nomProduit: inv.nom_produit,
    partenaireNom: partenaire?.raison_sociale,
  });
  const typeLabel = formatNomProduit(inv.type_produit);
  const partnerCaption = partenaire?.raison_sociale?.trim() || "";
  const showPartnerCaption =
    partnerCaption.length > 0 &&
    partnerCaption.toLowerCase() !== title.toLowerCase();
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
  const canTrackClientUpdate =
    enableScpiTracking && isClientInvestissementUpdateEligible(inv, nature);
  const canRetirer =
    enableRetirerAvoir &&
    Boolean(onRetirerAvoir) &&
    canClientRetirerAvoir(inv.origine);
  const canEditExtranet =
    Boolean(onSaveExtranet) &&
    isExtranetBookmarkEligible(inv.type_produit, nature?.estScpi);
  const [confirmRetirer, setConfirmRetirer] = useState(false);
  const [retirerError, setRetirerError] = useState<string | null>(null);

  return createPortal(
    <div
      className={`cp-layer ${inFrame ? "absolute" : "fixed"} inset-0 z-50 flex items-center justify-center p-3 @container`}
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
        className={`${CP.card} relative z-10 flex w-full max-w-lg flex-col overflow-hidden @min-[36rem]:max-w-3xl ${sheetShape}`}
      >
        <div className="flex items-start justify-between gap-3 border-b border-[var(--cp-line-soft)] px-5 py-4">
          <div className="min-w-0">
            <p id="cp-placement-detail-title" className={`${CP.body} font-medium`}>
              {title}
            </p>
            {showPartnerCaption ? (
              <p className={`${CP.caption} mt-0.5`}>{partnerCaption}</p>
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
            {showValorisationHistory ? (
              <ClientPreviewPlacementValorisation
                inv={inv}
                history={mergedHistory}
              />
            ) : null}
            {canTrackClientUpdate && onSubmitScpiDeclaration ? (
              <ClientPreviewScpiDeclarationForm
                inv={inv}
                nature={nature}
                history={mergedHistory}
                submitting={scpiDeclarationSubmitting}
                onSubmit={onSubmitScpiDeclaration}
                extranetUrl={canEditExtranet ? extranetUrl : undefined}
                extranetSubmitting={extranetSubmitting}
                onSaveExtranet={
                  canEditExtranet && onSaveExtranet
                    ? (url) => onSaveExtranet(inv.id, url)
                    : undefined
                }
              />
            ) : canEditExtranet && onSaveExtranet ? (
              <ClientPreviewExtranetBookmark
                currentUrl={extranetUrl}
                submitting={extranetSubmitting}
                onSave={(url) => onSaveExtranet(inv.id, url)}
              />
            ) : null}
            {canRetirer ? (
              <div className="py-3">
                {confirmRetirer ? (
                  <div className="space-y-2">
                    <p className={CP.caption}>
                      Retirer cet investissement de votre espace ? Votre
                      conseiller en sera informé.
                    </p>
                    {retirerError ? (
                      <p className={`${CP.caption} text-red-400`}>{retirerError}</p>
                    ) : null}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={retirerSubmitting}
                        onClick={() => {
                          void (async () => {
                            try {
                              setRetirerError(null);
                              await onRetirerAvoir?.(inv.id);
                              onClose();
                            } catch (error) {
                              setRetirerError(
                                error instanceof Error
                                  ? error.message
                                  : "Retrait impossible"
                              );
                            }
                          })();
                        }}
                        className="flex-1 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300 disabled:opacity-60"
                      >
                        {retirerSubmitting ? "Retrait…" : "Confirmer"}
                      </button>
                      <button
                        type="button"
                        disabled={retirerSubmitting}
                        onClick={() => setConfirmRetirer(false)}
                        className="flex-1 rounded-lg border border-[var(--cp-line)] px-3 py-2 text-sm text-[var(--cp-ink-muted)]"
                      >
                        Annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmRetirer(true)}
                    className="text-sm text-[var(--cp-ink-muted)] underline-offset-2 hover:text-[var(--cp-ink)] hover:underline"
                  >
                    Retirer cet investissement
                  </button>
                )}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    inFrame ? overlayPortal : document.body
  );
}
