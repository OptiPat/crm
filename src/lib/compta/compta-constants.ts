export const COMPTA_CATEGORIES = [
  "Formation",
  "Evenement",
  "Logiciel",
  "Matériel",
  "Train",
  "Hotel",
  "Avion",
  "Restaurant",
  "Cadeau client",
  "Abonnement",
  "Assurances",
  "Relevé de compte",
  "Autre",
] as const;

export type ComptaCategory = (typeof COMPTA_CATEGORIES)[number];

export const COMPTA_TVA_RATES = [20, 10, 5.5, 2.1, 0] as const;

export const DEFAULT_DRIVE_ROOT_FOLDER_ID = "1BFPOo103v0BoeNaZoKS2jsLaV57zjOSX";

export const DEFAULT_INDEMNITE_KM = 0.405;
