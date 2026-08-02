import {
  isArbitrageSuiviEligible,
  resolveArbitrageFicheProductKind,
} from "@/lib/alertes/arbitrage-alerte";
import type { ArbitrageFicheProductKind } from "@/lib/api/tauri-arbitrage-fiche";
import type { Investissement } from "@/lib/api/tauri-investissements";

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
