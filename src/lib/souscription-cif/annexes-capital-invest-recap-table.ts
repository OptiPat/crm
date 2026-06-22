import type { CapitalInvestAnnexeSouscription } from "@/lib/souscription-cif/capital-invest-annexe-souscriptions";
import { ANNEXES_SCPI_PAGE5_TABLE_HEADER } from "@/lib/souscription-cif/annexes-rapport-scpi-page5";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import {
  renderTemplateSegments,
  type SouscriptionPreviewSegment,
} from "@/lib/souscription-cif/render-template";

export const ANNEXES_CAPITAL_INVEST_RECAP_TABLE_HEADER = ANNEXES_SCPI_PAGE5_TABLE_HEADER;

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_ADAPTATION_TITLE =
  "La recommandation formulée est adaptée au client ?";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_ADAPTATION_CONTENT =
  "Oui. En effet, la recommandation permet au Client d'obtenir une réduction d'impôt, tout en diversifiant le patrimoine financier.";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_OBJECTIFS_TITLE =
  "La recommandation est conforme aux objectifs ?";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_DUREE_TITLE =
  "La durée d'investissement est conforme à la situation particulière du client ?";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_DUREE_CONTENT =
  "Oui. La durée recommandée est de 7 à 10 ans minimum, selon les millésimes souscrits. Cette durée peut être prorogée par la Société de gestion du Fonds.";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_CONNAISSANCES_TITLE =
  "La recommandation est adaptée aux connaissances et à l'expérience du client ?";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_CONNAISSANCES_CONTENT = `Oui. Aux termes du Questionnaire Profil Investisseur, le Client est classé « {{niveau_experience_qpi}} » en matière de connaissances et d'expérience financière. L'ensemble des informations relatives aux Fonds recommandés, à leurs particularités et à leur fonctionnement lui a été expliqué ; la documentation précontractuelle obligatoire (DICI, note d'information et documents réglementaires du ou des Fonds) lui a été remise.`;

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_RISQUE_TITLE =
  "La recommandation est adaptée au client vis-à-vis de son attitude à l'égard du risque et de sa capacité à subir des pertes ?";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_RISQUE_CONTENT =
  "Oui. Une épargne de précaution permet au Client de faire face à tout imprévu. De plus, cet investissement représente une part mineure du patrimoine global du Client.";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_REEXAMEN_TITLE =
  "Les services ou instruments recommandés entraînent-ils un réexamen périodique ?";

export const ANNEXES_CAPITAL_INVEST_RECAP_ROW_REEXAMEN_CONTENT =
  "Non. Il s'agit de fonds fermés pour lesquels aucune réévaluation périodique n'est possible du fait de leur vocation fiscale.";

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
    return `Oui. L'objectif déclaré est de bénéficier d'une réduction d'impôt. Ainsi {{${PRODUITS_CAPITAL_INVEST_CIBLES_VARIABLE}}} permet de bénéficier d'une réduction d'impôt en contrepartie d'un engagement de conservation des parts pendant la durée de blocage du Fonds.`;
  }
  return `Oui. L'objectif déclaré est de bénéficier d'une réduction d'impôt. Ainsi ${clause.produitsPhrase} ${clause.verbe} de bénéficier d'une réduction d'impôt en contrepartie d'un engagement de conservation des parts pendant la durée de blocage du Fonds.`;
}

export function buildProduitsCapitalInvestCiblesVariable(
  souscriptions: readonly CapitalInvestAnnexeSouscription[]
): string | null {
  const labels = buildCapitalInvestRecapProduitLabels(souscriptions);
  if (labels.length === 0) return null;
  return formatFrenchEtList(labels);
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
        ANNEXES_CAPITAL_INVEST_RECAP_ROW_DUREE_CONTENT,
        variables
      ),
    },
    {
      title: ANNEXES_CAPITAL_INVEST_RECAP_ROW_CONNAISSANCES_TITLE,
      contentSegments: renderTemplateSegments(
        ANNEXES_CAPITAL_INVEST_RECAP_ROW_CONNAISSANCES_CONTENT,
        variables
      ),
    },
    {
      title: ANNEXES_CAPITAL_INVEST_RECAP_ROW_RISQUE_TITLE,
      contentSegments: renderTemplateSegments(
        ANNEXES_CAPITAL_INVEST_RECAP_ROW_RISQUE_CONTENT,
        variables
      ),
    },
    {
      title: ANNEXES_CAPITAL_INVEST_RECAP_ROW_REEXAMEN_TITLE,
      contentSegments: renderTemplateSegments(
        ANNEXES_CAPITAL_INVEST_RECAP_ROW_REEXAMEN_CONTENT,
        variables
      ),
    },
  ];
}
