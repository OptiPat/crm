export type PageHeaderMeta = {
  title: string;
  subtitle: string;
};

const PAGE_HEADERS: Record<string, PageHeaderMeta> = {
  dashboard: {
    title: "Tableau de bord",
    subtitle: "Vue d'ensemble de votre activité",
  },
  pipe: {
    title: "Pipe",
    subtitle: "Affaires commerciales en cours",
  },
  contacts: {
    title: "Contacts",
    subtitle: "Clients, prospects et filleuls",
  },
  familles: {
    title: "Familles",
    subtitle: "Regroupements familiaux",
  },
  foyers: {
    title: "Foyers",
    subtitle: "Foyers fiscaux et membres",
  },
  prescripteurs: {
    title: "Prescripteurs",
    subtitle: "Réseau et parrainages",
  },
  partenaires: {
    title: "Partenaires",
    subtitle: "Produits et encours partenaires",
  },
  investissements: {
    title: "Investissements",
    subtitle: "Encours et souscriptions",
  },
  interactions: {
    title: "Historique des échanges",
    subtitle: "Interactions et relances",
  },
  taches: {
    title: "Tâches & rappels",
    subtitle: "Agenda et suivi opérationnel",
  },
  suivi: {
    title: "Suivi & alertes",
    subtitle: "Relances, étiquettes et envois",
  },
  etiquettes: {
    title: "Étiquettes",
    subtitle: "Segments et campagnes",
  },
  "templates-email": {
    title: "Modèles email",
    subtitle: "Templates et déclencheurs",
  },
  notes: {
    title: "Notes",
    subtitle: "Procédures personnelles et bibliothèque partagée",
  },
  comptabilite: {
    title: "Comptabilité",
    subtitle: "Dépenses, factures et bilan",
  },
  newsletter: {
    title: "Newsletter",
    subtitle: "Campagnes et abonnés",
  },
  documents: {
    title: "Documents",
    subtitle: "Imports et pièces justificatives",
  },
  "souscription-cif": {
    title: "Souscription CIF",
    subtitle: "Lettres de mission et dossiers",
  },
  parametres: {
    title: "Paramètres",
    subtitle: "Configuration de l'application",
  },
};

const DEFAULT_HEADER: PageHeaderMeta = {
  title: "Patrimoine CRM",
  subtitle: "Gérez vos clients et leur patrimoine",
};

export function getPageHeader(pageId: string): PageHeaderMeta {
  return PAGE_HEADERS[pageId] ?? DEFAULT_HEADER;
}
