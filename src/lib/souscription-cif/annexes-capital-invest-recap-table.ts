import type { CapitalInvestAnnexeSouscription } from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";
import { ANNEXES_SCPI_PAGE5_TABLE_HEADER } from "@/lib/souscription-cif/annexes-rapport-scpi-page5";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import {
  renderTemplateSegments,
  type SouscriptionPreviewSegment,
} from "@/lib/souscription-cif/render-template";

export const ANNEXES_CAPITAL_INVEST_RECAP_TABLE_HEADER = ANNEXES_SCPI_PAGE5_TABLE_HEADER;

export const DEFAULT_CAPITAL_INVEST_DUREE_BLOCAGE_ANNEES = "10";

export const DUREE_BLOCAGE_CAPITAL_INVEST_ANNEES_VARIABLE = "duree_blocage_capital_invest_annees";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_ADAPTATION_TITLE =
  "La recommandation formulée est adaptée au client ?";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_ADAPTATION_CONTENT =
  "OUI. En effet, la recommandation permet au Client d'obtenir une réduction d'impôt, tout en diversifiant le patrimoine financier.";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_OBJECTIFS_TITLE =
  "La recommandation est conforme aux objectifs ?";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_DUREE_TITLE =
  "La durée d'investissement est conforme à la situation particulière du client ?";

export function buildCapitalInvestRecapDureeContent(
  dossier: Pick<SouscriptionDossierFields, "capitalInvestDureeBlocageAnnees">
): string {
  const annees = resolveCapitalInvestDureeBlocageAnnees(dossier.capitalInvestDureeBlocageAnnees);
  return `Oui. La durée recommandée est à minima de ${annees} ans. Cette durée peut être prorogée par la Société de gestion du Fonds.`;
}

/** Variable affichée en rouge si aucune souscription renseignée. */
export const PRODUITS_CAPITAL_INVEST_CIBLES_VARIABLE = "produits_capital_invest_cibles";

const RECAP_PRODUIT_LABEL_BY_TYPE: Record<
  CapitalInvestAnnexeSouscription["type"],
  (name: string) => string
> = {
  fcpi: (name) => `le FCPI ${name}`,
  fcpr: (name) => `le FCPR ${name}`,
  fpci: (name) => `le FPCI ${name}`,
  fip: (name) => `le FIP ${name}`,
  "fip-outre-mer": (name) => `le FIP Outre-Mer ${name}`,
};

/** Libellé produit pour le tableau récap (ex. « le FCPI Odysée M2 »). */
export function formatCapitalInvestProduitRecapLabel(
  type: CapitalInvestAnnexeSouscription["type"],
  nomFonds: string
): string | null {
  const name = nomFonds.trim();
  if (!name) return null;
  return RECAP_PRODUIT_LABEL_BY_TYPE[type](name);
}

export function buildCapitalInvestRecapProduitLabels(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): string[] {
  const labels: string[] = [];
  for (const row of souscriptions) {
    const label = formatCapitalInvestProduitRecapLabel(row.type, row.nomFonds);
    if (label) labels.push(label);
  }
  return labels;
}

function formatFrenchEtList(items: readonly string[]): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0]!;
  if (items.length === 2) return `${items[0]} et ${items[1]}`;
  return `${items.slice(0, -1).join(", ")} et ${items[items.length - 1]}`;
}

/** Phrase produits + verbe (permet / permettent) pour la ligne objectifs. */
export function buildCapitalInvestRecapObjectifsProduitsClause(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): { produitsPhrase: string; verbe: "permet" | "permettent" } | null {
  const labels = buildCapitalInvestRecapProduitLabels(souscriptions);
  if (labels.length === 0) return null;
  return {
    produitsPhrase: formatFrenchEtList(labels),
    verbe: labels.length === 1 ? "permet" : "permettent",
  };
}

export function buildCapitalInvestRecapObjectifsContent(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): string {
  const clause = buildCapitalInvestRecapObjectifsProduitsClause(souscriptions);
  if (!clause) {
    return `OUI. L'objectif déclaré est de bénéficier d'une réduction d'impôt. Ainsi {{${PRODUITS_CAPITAL_INVEST_CIBLES_VARIABLE}}} permet de bénéficier d'une réduction d'impôt en contrepartie d'un engagement de conservation des parts pendant la durée de blocage du Fonds.`;
  }
  return `OUI. L'objectif déclaré est de bénéficier d'une réduction d'impôt. Ainsi ${clause.produitsPhrase} ${clause.verbe} de bénéficier d'une réduction d'impôt en contrepartie d'un engagement de conservation des parts pendant la durée de blocage du Fonds.`;
}

export function buildProduitsCapitalInvestCiblesVariable(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): string | null {
  const labels = buildCapitalInvestRecapProduitLabels(souscriptions);
  if (labels.length === 0) return null;
  return formatFrenchEtList(labels);
}

export function resolveCapitalInvestDureeBlocageAnnees(raw: string): string {
  const trimmed = raw.trim();
  return /^\d+$/.test(trimmed) ? trimmed : DEFAULT_CAPITAL_INVEST_DUREE_BLOCAGE_ANNEES;
}

export function buildDureeBlocageCapitalInvestAnneesVariable(
  dossier: Pick<SouscriptionDossierFields, "capitalInvestDureeBlocageAnnees">
): string {
  return resolveCapitalInvestDureeBlocageAnnees(dossier.capitalInvestDureeBlocageAnnees);
}

export type AnnexesCapitalInvestRecapRowView = {
  title: string;
  contentSegments: SouscriptionPreviewSegment[];
};

export function buildAnnexesCapitalInvestRecapRows(
  variables: Record<string, string | null>,
  dossier: SouscriptionDossierFields
): AnnexesCapitalInvestRecapRowView[] {
  const souscriptions = dossier.capitalInvestAnnexeSouscriptions;
  return [
    {
      title: ANNEXES_CAPITAL_INVEST_RECAP_ROW_ADAPTATION_TITLE,
      contentSegments: renderTemplateSegments(
        ANNEXES_CAPITAL_INVEST_RECAP_ROW_ADAPTATION_CONTENT,
        variables
      ),
    },
    {
      title: ANNEXES_CAPITAL_INVEST_RECAP_ROW_OBJECTIFS_TITLE,
      contentSegments: renderTemplateSegments(
        buildCapitalInvestRecapObjectifsContent(souscriptions),
        variables
      ),
    },
    {
      title: ANNEXES_CAPITAL_INVEST_RECAP_ROW_DUREE_TITLE,
      contentSegments: renderTemplateSegments(
        buildCapitalInvestRecapDureeContent(dossier),
        variables
      ),
    },
  ];
}
