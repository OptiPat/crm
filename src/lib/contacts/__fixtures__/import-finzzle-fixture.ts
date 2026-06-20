// Fixture ANONYMISÉE du modèle d'export contacts « Finzzle » (CSV, séparateur ';').
// Données 100 % fictives (cf. .cursor/rules/donnees-sensibles.mdc) : noms génériques,
// emails @example.com, téléphones factices. Le vrai fichier client reste dans
// `_import_local/` (gitignoré) et ne doit jamais être commité.
//
// Particularités du modèle reproduites ici, car ce sont elles qui ont motivé le correctif :
//  - téléphone forcé en texte Excel : `="+33..."` ;
//  - dates au format français JJ/MM/AAAA avec un jour <= 12 (cas où SheetJS inverse
//    jour/mois s'il n'est pas lu en mode brut) ;
//  - colonne « Statut » (Client / Prospect / Contact) et « Origine du contact ».

export const FINZZLE_HEADERS = [
  "Statut",
  "Civilité",
  "Nom",
  "Prénom",
  "Date de naissance",
  "Âge",
  "Téléphone",
  "Email",
  "Adresse",
  "Code postal",
  "Ville",
  "Pays",
  "Consultant principal",
  "Avec relation secondaire",
  "Consultant secondaire",
  "Origine du contact",
  "Foyer fiscal commun",
  "Épargne disponible",
  "Épargne totale",
  "TMI",
  "Impôt brut",
  "Taux d'endettement",
  "Prochaine date de fin de prêt",
  "Capacité d'épargne (mensuelle)",
  "Capacité d'endettement restante (mensuelle)",
  "Statut DER",
  "Date signature DER",
  "Recueil d'informations",
  "Date signature Recueil d'informations",
  "QPI",
  "Date signature QPI",
  "Purge RGPD",
  "Etiquettes",
] as const;

/** CSV anonymisé prêt à être lu par SheetJS (mêmes colonnes/format que l'export réel). */
export const FINZZLE_SAMPLE_CSV = [
  FINZZLE_HEADERS.join(";"),
  // Client, date jour<=12 (05/03 -> 5 mars, surtout pas 3 mai)
  `Client;Madame;DUPONT;Marie;05/03/1985;41;="+33600000001";marie.dupont@example.com;12 rue des Acacias;75001;Paris;France;CONSEILLER Test;Non;-;Ami;Non;1000,0000;2000,0000;11;-;30;06/01/2041;500,0000;-100;Signe;13/06/2026;Signe;19/06/2026;Signe;19/06/2026;-;-`,
  // Prospect, date jour>12 (laissée en texte par SheetJS même hors mode brut)
  `Prospect;Monsieur;BERNARD;Luc;28/11/1990;35;="+33600000002";luc.bernard@example.com;8 place du Marché;69002;Lyon;France;CONSEILLER Test;Non;-;Recommandation;Non;500,0000;500,0000;11;-;20;01/08/2045;300,0000;-50;Signe;13/06/2026;Signe;19/06/2026;-;-;-;-`,
  // Contact, autre jour<=12 (03/07 -> 3 juillet)
  `Contact;Monsieur;LEGRAND;Paul;03/07/1978;47;="+33600000003";paul.legrand@example.com;5 avenue du Parc;33000;Bordeaux;France;CONSEILLER Test;Non;-;Réseaux sociaux;Non;0;0;-;-;0;-;0;0;Signe;13/06/2026;-;-;-;-;-;-`,
].join("\r\n");
