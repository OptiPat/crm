/**
 * Catalogue des fiches « Descriptions_SCPI » pour les annexes CIF.
 * Sélection via `scpiAnnexeSouscriptions` → concaténation des blocs ci-dessous.
 */
export type ScpiAnnexeProductFiche = {
  key: string;
  /** Nom affiché (ex. Comète, Corum Origin). */
  label: string;
  /** Texte annexe complet pour ce produit. */
  description: string;
  /** Prix de souscription d'une part (€) — alimente « soit X € la part x N parts ». */
  partPriceEur?: number;
};

/** Fiches SCPI de rendement — textes annexes CIF (format compact). */
export const SCPI_ANNEXE_PRODUCT_FICHES: ReadonlyArray<ScpiAnnexeProductFiche> = [
  {
    key: "comete",
    label: "Comète",
    partPriceEur: 250,
    description: `— COMÈTE —

La SCPI Comète vise à se constituer un patrimoine diversifié dans l'immobilier tertiaire (bureaux commerces, hôtellerie, santé, éducation, logistique et locaux d'activité). La stratégie géographique est d'investir au sein de l'Union Européenne (seule la logistique sera exclue de l'UE) et pourra également se positionner en Amérique du Nord, en Australie et en Nouvelle Zélande en cas d'opportunités.

Données clés 2025
Capitalisation : 519,6M€ ; Actifs : 27 ; Baux : 77; Taux de distribution : 9% brut de fiscalité ; TOF : 93,6%; Durée min : 10 ans; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 10% HT
- Gestion : 11% HT des produits locatifs HT et des produits financiers nets encaissés
- Acquisition d'actifs : 1% HT du prix d'acquisition des actifs et droits immobiliers
- Cession d'actifs : 1% HT du prix de vente
- Réalisation et suivi des travaux : 3% HT Max du montant des travaux;`,
  },
  {
    key: "transitions_europe",
    label: "Transitions Europe",
    partPriceEur: 202,
    description: `— TRANSITIONS EUROPE —

Arkea Transition Europe accompagne les transitions du marché de l'immobilier en investissant dans un portefeuille d'actifs diversifiés. Elle investit en Europe ( Espagne, Pays-Bas, République d'Irlande…) pour bénéficier des opportunités des différents cycles immobilier, très majoritairement dans des actifs d'immobilier d'entreprise (bureaux, santé, éducation, logistique, activités, hébergement géré…).

Données clés 2025
Capitalisation : 1,25Md€ ; Actifs : 54 ; Baux : 313; Taux de distribution : 8,25% ; TOF : 98,5% ; Durée min : 10 ans ; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 10%
- Gestion : 10% HT du montant des recettes nettes
- Acquisition d'actifs : 0%
- Cession d'actifs : 2% du prix de cession
- Réalisation et suivi des travaux : 5% HT du montant des travaux réalisés ;`,
  },
  {
    key: "epargne_pierre_europe",
    label: "Épargne Pierre Europe",
    partPriceEur: 200,
    description: `— ÉPARGNE PIERRE EUROPE —

Epargne Pierre Europe accompagne les projets d'avenir de la 3ème puissance mondiale. Elle vous permet d'accéder à un patrimoine immobilier diversifié tant sur le plan sectoriel (bureaux, commerces, ou locaux d'activité) que géographique, en bénéficiant des différences de cycles économique entre les pays de la zone euro.

Données clés 2025
Capitalisation : 2 803M€ ; Actifs : 44 ; Baux : 1020 ; Taux de distribution : 5,28% ; TOF : 100% ; Durée min : 10 ans ; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 10%
- Gestion : 10% HT (12%TTC) du montant des recettes brutes
- Acquisition d'actifs : 0%
- Cession d'actifs : Uniquement en cas de plus-value : 1%HT si PV entre 5% et 10% et 1,25%HT si PV>10%
- Réalisation et suivi des travaux : 2,5% HT si travaux > 250 000€%;`,
  },
  {
    key: "epargne_pierre",
    label: "Épargne Pierre",
    partPriceEur: 208,
    description: `— ÉPARGNE PIERRE —

Épargne Pierre déploie une stratégie recherchant le rendement en se positionnant sur toutes les typologies d'actifs : bureaux, commerces et locaux d'activités pour profiter des opportunités de marché. La stratégie privilégie les grandes métropoles régionales afin de bénéficier d'un bon mix géographique sur le territoire et cible des actifs d'une valeur unitaire entre 1 et 50 M€. Epargne Pierre bénéficie du label ISR et prend en compte les critères environnementaux, sociétaux et de gouvernance (ESG) dans le cadre de la mise en œuvre de sa stratégie d'investissement et dans sa gestion des actifs. La capitalisation importante permet une large diversification et mutualisation du risque immobilier grâce à la variété d'actifs et des locataires (principalement grands utilisateurs publics ou privés).

Données clés 2025
Capitalisation : 2 811 M€ ; Actifs : 414 ; Baux : 1020 ; Taux de distribution : 5,28% ; TOF : 94,41% ; Durée min : 10 ans ; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 10%
- Gestion : 10% HT (12% TTC) du montant des recettes brutes
- Acquisition d'actifs : 0%
- Cession d'actifs : 0%
- Réalisation et suivi des travaux : 0%;`,
  },
  {
    key: "alta_convictions",
    label: "Alta Convictions",
    partPriceEur: 308,
    description: `— ALTA CONVICTIONS —

Alta Convictions est une SCPI agile et conçue pour s'adapter au nouveau cycle immobilier, tant d'un point de vue sectoriel, privilégiant au lancement des commerces, des écoles et de la logistique principalement ; que géographique, avec des investissements dans les métropoles françaises et jusqu'à 20% du portefeuille immobilier en Europe.

Données clés 2025
Capitalisation : 62,6M€ ; Actifs : 16 ; Baux :37; Taux de distribution : 6,5% ; TOF : 96%; Durée min : 10 ans; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 8,45%
- Gestion : 11,45% HT max (13,74% TTC) des produits encaissés par la SCPI
- Acquisition d'actifs : 1,25% HT Max (1,5% TTC) du prix d'acquisition
- Cession d'actifs : 2,5% HT Max (3% TTC) du prix de cession net vendeur
- Réalisation et suivi des travaux : 3% HT Max (3,6% TTC) du montant TTC des travaux réalisés;`,
  },
  {
    key: "osmo_energie",
    label: "Osmo Energie",
    partPriceEur: 300,
    description: `— OSMO ENERGIE —

La SCPI Osmo Energie a pour objectif d'acheter des biens immobiliers en France et en Europe afin d'améliorer leur performance énergétique et financière. Grâce à des outils de mesure et une meilleure maîtrise des consommations, elle souhaite positionner le patrimoine immobilier sur une trajectoire de sobriété énergétique et de décarbonation.

Données clés 2025
Capitalisation : 100,45M€ ; Actifs : 24 ; Baux : 36; Taux de distribution : 7% ; TOF : 100%; Durée min : 10 ans; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 12%
- Gestion : 9% HT (10,8%TTC) des loyers hors taxe et hors charge
- Acquisition d'actifs : 1% HT (1,20% TTC) Max du prix d'acquisition
- Cession d'actifs : 1% HT (1,20% TTC) Max du prix de vente, uniquement en cas de plus-value
- Réalisation et suivi des travaux : 0%;`,
  },
  {
    key: "ncap_regions",
    label: "NCAP Régions",
    partPriceEur: 682,
    description: `— NCAP RÉGIONS —

Une SCPI diversifiée déployant une stratégie dynamique et opportuniste privilégiant la recherche de rendement en contrepartie d'un risque plus élevé. La politique d'investissement vise principalement l'acquisition d'actifs de petites tailles en régions afin de sortir des zones de marché les plus tendues et privilégier les zones moins concurrentielles. La SCPI bénéficie d'un patrimoine diversifié sur les bureaux, commerces et locaux d'activités afin de tirer profit des opportunités sur tous les segments. La capitalisation de la SCPI offre une mutualisation plus limitée avec un portefeuille d'actifs plus concentré.

Données clés 2025
Capitalisation : 1084M€ ; Actifs : 178 ; Baux : 430 ; Taux distribution: 5,72% ; TOF : 91,7% ; Durée min: 10 ans ; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 10%
- Gestion : 10% HT (12%TTC) des produits locatifs HT et des produits financiers nets encaissés
- Acquisition d'actifs : 0%
- Cession d'actifs : 2% du prix de vente net vendeur si celui-ci est inférieur à 5M€ et 1,5% si celui-ci est supérieur à 5M€
- Réalisation et suivi des travaux : 1% HT Max sur les gros travaux supérieurs à 100k€ HT;`,
  },
  {
    key: "corum_origin",
    label: "Corum Origin",
    partPriceEur: 1135,
    description: `— CORUM ORIGIN —

La SCPI Corum Origin construit un patrimoine diversifié (bureaux, commerces, hôtels) en saisissant des opportunités selon les cycles économiques. Elle investit exclusivement en zone euro, répartissant ses actifs dans de nombreux pays européens pour optimiser le rendement et la fiscalité.

Données clés 2025
Capitalisation : 3.794 Milliards € ; Actifs : 167 ; Baux : 412 ; Taux de distribution : 6.5% ; TOF : 96.2% ; Durée min : 10 ans ; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 11.964% TTC
- Gestion : 12.4 % HT loyers encaissés
- Acquisition d'actifs : 0%
- Cession d'actifs : 5% TTI du prix de vente net vendeur, si la plus value est supérieure à 5%
- Réalisation et suivi de travaux : 0%;`,
  },
  {
    key: "corum_eurion",
    label: "Corum Eurion",
    partPriceEur: 215,
    description: `— CORUM EURION —

La SCPI Corum Eurion investit dans un patrimoine immobilier récent et durable (bureaux, logistique) répondant aux dernières normes environnementales. Sa stratégie mise sur des locataires solides à travers toute la zone euro. Elle vise un rendement attractif en conciliant performance financière et critères socialement responsables (ISR).

Données clés 2025
Capitalisation : 1,507 Milliards € ; Actifs : 52 ; Baux : 120 ; Taux de distribution : 5,73 % ; TOF : 99,92% ; Durée min : 10 ans ; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 12 % TTC
- Gestion : 12,4% HT loyers encaissés
- Acquisition d'actifs : 0%
- Cession d'actifs : 5 % TTI du prix de vente net vendeur, si la plus-value est supérieure à 5 %
- Réalisation et suivi des travaux : 0%;`,
  },
  {
    key: "immorente",
    label: "Immorente",
    partPriceEur: 340,
    description: `— IMMORENTE —

Immorente a pour objet l'acquisition d'un parc immobilier locatif, situé principalement dans les grandes métropoles françaises, de l'Espace Economique Européen, du Royaume-Uni et de la Suisse, et à titre accessoire dans les autres villes de la même zone. Elle investit de manière diversifiée dans les principales typologies d'actifs immobiliers : bureaux, murs de commerces, hôtellerie et loisirs, logistique et activités, santé et résidentiel. Cette SCPI attache une importance à la diversification et mutualisation du risque, notamment en diversifiant le secteur géographique (25% à l'étranger), la typologie d'actifs, les secteurs d'activité et la qualité des locataires.

Données clés 2025
Capitalisation : 4 391M€ ; Actifs : 994 ; Baux : 2963 ; Taux de distribution : 5,00% ; TOF : 91,21% ; Durée min : 10 ans ; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 10%
- Gestion : 10% HT (12% TTC) des produits locatifs HT et des produits financiers nets encaissés
- Acquisition d'actifs : 0%
- Cession d'actifs : 2,5% HT (3% TTC) du prix de vente du bien immobilier
- Réalisation et suivi des travaux : 0%;`,
  },
  {
    key: "activimmo",
    label: "Activimmo",
    partPriceEur: 610,
    description: `— ACTIVIMMO —

Activimmo est une SCPI spécialisée ciblant les actifs à usage de locaux d'activités, d'entrepôts et de logistique urbaine ou du « dernier kilomètre », situés en périphéries des villes, à proximité des axes routiers ou au sein même des bassins d'emploi et de consommation. Les locaux pourront abriter diverses activités permettant de répondre aux besoins immobiliers : des PME / PMI et ETI, jusqu'aux filiales de grands groupes, ou encore des entreprises à la recherche de bâtiments pour assurer leur service de logistique notamment du dernier kilomètre, dernier ou avant-dernier maillon précédant la livraison au consommateur final. A titre de diversification, la SCPI pourra investir en bureaux et commerces.

Données clés 2025
Capitalisation : 1 400 M€ ; Actifs : 179 ; Baux : 463 ; Taux de distribution : 5,50% ; TOF : 92,6% ; Durée min : 10 ans ; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 10,6%
- Gestion : 10% HT (12% TTC) des produits locatifs HT et des produits financiers nets encaissés
- Acquisition d'actifs : 1% HT (1,2% TTC) du prix d'achat net vendeur
- Cession d'actifs : 1% HT (1,2% TTC) du prix de vente net vendeur
- Réalisation et suivi des travaux : 3% HT Max (3,6% TTC) sur les travaux immobilisés et relatifs aux gros entretiens;`,
  },
  {
    key: "lf_avenir_sante",
    label: "LF Avenir Santé",
    partPriceEur: 300,
    description: `— LF AVENIR SANTÉ —

LF Avenir Santé est une SCPI spécialisée dans l'immobilier de santé, centrée sur la médecine de proximité (médecins généralistes, ophtalmologues, dentistes, radiologues, etc.). Elle bénéficie de tendances démographiques favorables, notamment le vieillissement de la population et la forte demande d'accès aux soins dans les secteurs public et privé. À titre de diversification, elle investit également dans les soins alternatifs (cures thermales, balnéothérapie) et l'habitat senior (résidences seniors et coliving). La répartition géographique vise un partage 50/50 entre la France et l'étranger (Allemagne, Royaume-Uni, Irlande, Belgique, Pays-Bas, Luxembourg et Espagne).

Données clés 2025
Capitalisation : 273,4 M€ ; Actifs : 33 ; Baux : NC ; Taux de distribution : 5,05% ; TOF : 100% ; Durée min : 10 ans ; Risque : 3/7
Les performances du passé ne préjugent pas des performances futures.

Principaux frais :
- Souscription : 9%
- Gestion : 10% HT (12% TTC) des produits locatifs HT et des produits financiers nets encaissés
- Acquisition d'actifs : 1,25% HT Max du montant de la transaction
- Cession d'actifs : 1,25% HT Max du montant de la transaction
- Réalisation et suivi des travaux : 3% HT Max du montant TTC des travaux réalisés;`,
  },
];

/** Prix de part catalogue (€) — valeur par défaut, surchargeable par dossier. */
export function getScpiAnnexeCatalogPartPriceEur(productKey: string): number | null {
  const price = SCPI_ANNEXE_PRODUCT_FICHES.find((p) => p.key === productKey)?.partPriceEur;
  return price != null && price > 0 ? price : null;
}

export function getScpiAnnexeDefaultPartPriceEurString(productKey: string): string {
  const price = getScpiAnnexeCatalogPartPriceEur(productKey);
  return price != null ? String(price) : "";
}

export function buildDescriptionsScpiFromKeys(keys: readonly string[]): string {
  const blocks: string[] = [];
  for (const key of keys) {
    const fiche = SCPI_ANNEXE_PRODUCT_FICHES.find((p) => p.key === key);
    if (fiche) blocks.push(fiche.description.trim());
  }
  return blocks.filter(Boolean).join("\n\n");
}
