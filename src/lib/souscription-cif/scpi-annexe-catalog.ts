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
  /**
   * `false` : plus commercialisée — masquée des nouveaux dossiers CIF, mais gardée pour les
   * dossiers existants et le calcul de rémunération (frais de souscription).
   */
  commercialisee?: boolean;
};

/** SCPI proposées dans un nouveau dossier CIF (hors celles plus commercialisées). */
export function isScpiAnnexeCommercialisee(fiche: Pick<ScpiAnnexeProductFiche, "commercialisee">): boolean {
  return fiche.commercialisee !== false;
}

/** Fiches SCPI de rendement — textes annexes CIF (format compact). */
export const SCPI_ANNEXE_PRODUCT_FICHES: ReadonlyArray<ScpiAnnexeProductFiche> = [
  {
    key: "comete",
    label: "Comète",
    partPriceEur: 250,
    description: `— COMÈTE —

La SCPI Comète a pour objectif de constituer un patrimoine immobilier locatif diversifié dans l'immobilier tertiaire (bureaux, entrepôts logistiques, locaux d'activités, commerces, hôtellerie, santé, éducation, entre autres). Elle exclut l'acquisition de bâtiments d'activités et de logistiques en zone euro. Elle peut investir au sein de l'Union européenne (hors France métropolitaine) prioritairement, et/ou en Amérique du Nord et/ou dans les pays suivants : Andorre, Islande, Monaco, Norvège, Royaume-Uni, Serbie, Suisse, Australie et Nouvelle-Zélande.

Données au 30/09/2026
Capitalisation : 902,9 M€ ; Actifs : 44 ; Baux : 137 ; Taux de distribution : 9 % brut de fiscalité ; TOF : 99,5 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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
    partPriceEur: 204,
    description: `— TRANSITIONS EUROPE —

La SCPI Transitions Europe investit principalement dans des biens immobiliers professionnels (tels que des espaces de santé, éducatifs, de logistique, de travail, commerciaux, et plus) et, occasionnellement, dans des biens résidentiels. Ses acquisitions, neuves ou anciennes, pourront se situer partout dans l'Union européenne et être financées jusqu'à 40 % par emprunt.

Données au 30/09/2026
Capitalisation : 1,48 Md€ ; Actifs : 65 ; Locataires : 379 ; Taux de distribution 2025 : 7,60 % ; TOF : 97,9 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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
    partPriceEur: 20,
    description: `— ÉPARGNE PIERRE EUROPE —

La SCPI Épargne Pierre Europe a pour objectif la constitution d'un patrimoine immobilier diversifié tant sur le plan géographique que locatif permettant de distribuer un revenu et de valoriser le prix de la part. Ses investissements immobiliers porteront sur des actifs immobiliers de toute nature en Europe (zone euro). Sa stratégie d'investissement porte sur des actifs d'immobilier d'entreprise (notamment bureaux, commerces, locaux d'activités, entrepôts), ainsi que sur tous types d'actifs immobiliers professionnels dans le secteur de la santé, de tourisme et loisirs, de l'éducation et dans des résidences gérées.

Données au 30/09/2026
Capitalisation : 763 M€ ; Actifs : près de 40 ; Locataires : 73 ; Taux de distribution 2025 : 6,75 % brut de fiscalité étrangère ; TOF : 99,77 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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
    partPriceEur: 20.8,
    description: `— ÉPARGNE PIERRE —

La SCPI Épargne Pierre déploie une stratégie recherchant le rendement en se positionnant sur toutes les typologies d'actifs : bureaux, commerces et locaux d'activités pour profiter des opportunités de marché. La stratégie privilégie les grandes métropoles régionales afin de bénéficier d'un bon mix géographique sur le territoire et cible des actifs d'une valeur unitaire entre 1 et 50 M€. Epargne Pierre bénéficie du label ISR et prend en compte les critères environnementaux, sociétaux et de gouvernance (ESG) dans le cadre de la mise en œuvre de sa stratégie d'investissement et dans sa gestion des actifs. La capitalisation importante permet une large diversification et mutualisation du risque immobilier grâce à la variété d'actifs et des locataires (principalement grands utilisateurs publics ou privés).

Données au 30/09/2026
Capitalisation : 2 811 M€ ; Actifs : 417 ; Locataires : 762 ; Taux de distribution 2025 : 5,28 % ; TOF : 94,05 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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

La SCPI Alta Convictions investira, directement ou indirectement, sur l'ensemble des classes d'actifs (résidentiels, commerces, équipements publics, hôtels, résidences services, bureaux régions, bureaux Île-de-France, logistiques et locaux d'activités, etc.) et aucune classe d'actif ne représentera plus de 50 % de la valeur totale du patrimoine à partir de la 3e année suivant sa constitution. En termes géographiques, elle investit majoritairement dans des métropoles françaises. Une partie des investissements pourra également être réalisée au sein de pays membres ou anciens membres de l'Union européenne dans une limite de 20 % maximum de son actif.

Données au 30/09/2026
Capitalisation : 142,1 M€ ; Actifs : 20 ; Baux : 40 ; Taux de distribution 2025 : 6,57 % brut de fiscalité ; TOF : 97 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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
    partPriceEur: 306,
    description: `— OSMO ENERGIE —

La SCPI Osmo Energie a pour objectif d'acheter des biens immobiliers en France et en Europe afin d'améliorer leur performance énergétique et financière. Grâce à des outils de mesure et une meilleure maîtrise des consommations, elle souhaite positionner le patrimoine immobilier sur une trajectoire de sobriété énergétique et de décarbonation.

Données au 30/09/2026
Capitalisation : 141,97 M€ ; Actifs : 27 ; Locataires : 41 ; Taux de distribution 2025 : 7,00 % ; TOF : 100 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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

La SCPI NCap Régions est une SCPI diversifiée déployant une stratégie dynamique et opportuniste privilégiant la recherche de rendement en contrepartie d'un risque plus élevé. La politique d'investissement vise principalement l'acquisition d'actifs de petites tailles en régions afin de sortir des zones de marché les plus tendues et privilégier les zones moins concurrentielles. La SCPI bénéficie d'un patrimoine diversifié sur les bureaux, commerces et locaux d'activités afin de tirer profit des opportunités sur tous les segments. La capitalisation de la SCPI offre une mutualisation plus limitée avec un portefeuille d'actifs plus concentré.

Données au 30/09/2026
Capitalisation : 1 115,7 M€ ; Actifs : 187 ; Baux : 435 ; Taux de distribution 2025 : 5,72 % ; TOF : 91,1 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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

Données au 30/09/2026
Capitalisation : 4,165 Md€ ; Actifs : 170 ; Locataires : 444 ; Taux de distribution 2025 : 6,50 % ; TOF : 95,48 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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

Données au 30/09/2026
Capitalisation : 1,56 Md€ ; Actifs : 55 ; Locataires : 131 ; Taux de distribution 2025 : 5,73 % ; TOF : 99,92 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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

La SCPI Immorente a pour objet l'acquisition et la gestion d'un parc immobilier locatif. Son univers d'investissement couvre de manière diversifiée les principales typologies d'immobilier locatif (murs de commerces, de bureaux, d'hôtellerie et de loisirs, de logistique et d'activités, de santé et résidentiel). Elle investit prioritairement en centre-ville, dans les grandes zones commerciales périphériques et dans les pôles tertiaires pour les bureaux. Les zones géographiques privilégiées sont principalement les grandes métropoles françaises et de l'Espace économique européen, du Royaume-Uni et de la Suisse, des États-Unis d'Amérique et du Canada et à titre accessoire les autres villes de la même zone.

Données au 30/09/2026
Capitalisation : 4 391 M€ ; Actifs : 976 ; Unités locatives : 3 266 ; Taux de distribution 2025 : 5,00 % brut de fiscalité ; TOF : 91,18 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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
    partPriceEur: 613.5,
    description: `— ACTIVIMMO —

La SCPI ActivImmo a pour objectif de constituer, par des investissements majoritaires, un patrimoine immobilier locatif spécialisé dans l'immobilier tertiaire à dominante de locaux d'activités, d'entrepôts, de messagerie et de logistique, et accessoirement bureaux ou commerces ne dépassant pas trente pour cent (30 %) de la valeur vénale du patrimoine ; patrimoine situé en France, dans les grandes métropoles de l'Union européenne ou en périphérie de ces métropoles. Sous réserve des conditions de marché et en fonction des opportunités, elle privilégie les actifs qui, de par leur emplacement et leurs caractéristiques techniques, sont ou peuvent potentiellement devenir des bâtiments de logistique urbaine.

Données au 30/09/2026
Capitalisation : 1,42 Md€ ; Actifs : 182 ; Baux : 452 ; Taux de distribution : 5,50 % ; TOF : 91,5 % ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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
    commercialisee: false,
    description: `— LF AVENIR SANTÉ —

LF Avenir Santé est une SCPI spécialisée dans l'immobilier de santé, centrée sur la médecine de proximité (médecins généralistes, ophtalmologues, dentistes, radiologues, etc.). Elle bénéficie de tendances démographiques favorables, notamment le vieillissement de la population et la forte demande d'accès aux soins dans les secteurs public et privé. À titre de diversification, elle investit également dans les soins alternatifs (cures thermales, balnéothérapie) et l'habitat senior (résidences seniors et coliving). La répartition géographique vise un partage 50/50 entre la France et l'étranger (Allemagne, Royaume-Uni, Irlande, Belgique, Pays-Bas, Luxembourg et Espagne).

Données clés 2025
Capitalisation : 273,4 M€ ; Actifs : 33 ; Baux : NC ; Taux de distribution : 5,05% ; TOF : 100% ; Durée de placement recommandée : 10 ans minimum ; Risque : 3/7
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
