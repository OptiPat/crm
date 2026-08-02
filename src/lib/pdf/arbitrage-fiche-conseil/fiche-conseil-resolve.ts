import {
  isArbitrageSuiviEligible,
  resolveArbitrageFicheProductKind,
} from "@/lib/alertes/arbitrage-alerte";
import type { ArbitrageFicheProductKind, FicheConseilTemplateFamily } from "@/lib/api/tauri-arbitrage-fiche";
import type { VpModificationPdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { resolveStelliumProductLabelFromCrmInvestissement } from "@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-stellium";

export type FicheConseilContext = {
  contactId: number;
  /** Indice AV/PER (titre tâche arbitrage auto, etc.). */
  titreHint?: string;
  descriptionHint?: string | null;
  /** Modèles PDF à utiliser (arbitrage vs modification VP). */
  templateFamily?: FicheConseilTemplateFamily;
  /** Détails modification VP (types cochés + valeurs saisies). */
  vpModification?: VpModificationPdfFillInput;
};

export function filterFicheConseilEligibleInvestissements(
  investissements: Investissement[]
): Investissement[] {
  return investissements.filter((inv) =>
    isArbitrageSuiviEligible(inv.type_produit, inv.origine, inv.statut)
  );
}

export function investissementToFicheProductKind(
  typeProduit: string
): ArbitrageFicheProductKind | null {
  if (typeProduit === "ASSURANCE_VIE") return "AV";
  if (typeProduit === "PER") return "PER";
  return null;
}

export function resolveFicheConseilProductKind(
  tache: { titre: string },
  investissement?: Pick<Investissement, "type_produit"> | null
): ArbitrageFicheProductKind | null {
  const fromTitle = resolveArbitrageFicheProductKind(tache);
  if (fromTitle) return fromTitle;
  if (investissement) {
    return investissementToFicheProductKind(investissement.type_produit);
  }
  return null;
}

export function formatFicheConseilContratLabel(inv: Investissement): string {
  const kind = investissementToFicheProductKind(inv.type_produit) ?? inv.type_produit;
  const contrat = inv.numero_contrat?.trim() || "sans n° contrat";
  const produit = inv.nom_produit?.trim();
  return produit ? `${kind} — ${produit} — ${contrat}` : `${kind} — ${contrat}`;
}

export type FicheConseilContratPickItem = {
  investissementId: number;
  label: string;
  productKind: ArbitrageFicheProductKind;
};

export function filterFicheConseilContratPickItemsByProductKind(
  items: FicheConseilContratPickItem[],
  productKind: ArbitrageFicheProductKind
): FicheConseilContratPickItem[] {
  return items.filter((item) => item.productKind === productKind);
}

/** Filtre par libellé produit Stellium (ex. Cristalliance Avenir), pas seulement AV/PER. */
export function filterFicheConseilContratPickItemsByStelliumProduct(
  items: FicheConseilContratPickItem[],
  investissements: Investissement[],
  partenaireNomsById: ReadonlyMap<number, string>,
  stelliumProductLabel: string
): FicheConseilContratPickItem[] {
  const target = stelliumProductLabel.trim();
  if (!target) return items;
  const invById = new Map(investissements.map((inv) => [inv.id, inv]));
  return items.filter((item) => {
    const inv = invById.get(item.investissementId);
    if (!inv) return false;
    const partenaireNom = inv.partenaire_id
      ? partenaireNomsById.get(inv.partenaire_id)
      : undefined;
    return (
      resolveStelliumProductLabelFromCrmInvestissement({
        type_produit: inv.type_produit,
        nom_produit: inv.nom_produit,
        partenaireNom,
      }) === target
    );
  });
}

export function toFicheConseilContratPickItems(
  investissements: Investissement[]
): FicheConseilContratPickItem[] {
  return filterFicheConseilEligibleInvestissements(investissements).flatMap((inv) => {
    const productKind = investissementToFicheProductKind(inv.type_produit);
    if (!productKind) return [];
    return [
      {
        investissementId: inv.id,
        label: formatFicheConseilContratLabel(inv),
        productKind,
      },
    ];
  });
}
