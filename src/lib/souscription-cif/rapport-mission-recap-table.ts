/** Tableau récap — Rapport de mission page 1 (2 lignes). */

export const RM_RECAP_ROW_DEMANDE_TITLE = "RAPPEL DE LA DEMANDE";

export const RM_RECAP_ROW_SITUATION_TITLE = "RAPPEL DE LA SITUATION DU CLIENT";

export const RM_RECAP_SITUATION_INTRO = `La situation du Client est reprise dans le Recueil d'Information. Le profil financier ainsi que les préférences en matière de durabilité sont repris dans le Questionnaire Profil Investisseur.`;

/** Libellés panneau dossier (longs) — préremplissage et édition. */
export const RM_PANEL_REVENUS_BULLET_LABEL =
  "Revenus ; Imposition ; Nombre de parts fiscales ; TMI ou taux de prélèvement";

export const RM_PANEL_IMMOBILIER_BULLET_LABEL =
  "Immobilier (à détailler si besoin : résidence principale, secondaire, locative avec revenus associés, appétence, objectif : diversification, rééquilibrage)";

export const RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL =
  "Valeurs mobilières (à détailler si besoin, détention court, moyen ou long terme)";

export const RM_PANEL_EPARGNE_BULLET_LABEL = "Épargne de précaution";

export const RM_PANEL_ENDETTEMENT_BULLET_LABEL = "Endettement";

export const RM_PANEL_MONTANT_INVESTISSEMENT_BULLET_LABEL =
  "Montant de l'investissement envisagé";

export const RM_RECAP_SITUATION_SRI_BULLET_LABEL = "Profil de risque (SRI + définition)";

/** Libellés document rapport (courts). */
export const RM_RAPPORT_REVENUS_BULLET_LABEL = "Revenus";

export const RM_RAPPORT_IMMOBILIER_BULLET_LABEL = "Immobilier";

export const RM_RAPPORT_VALEURS_MOBILIERES_BULLET_LABEL =
  "Valeurs mobilières (à détailler si besoin, détention court, moyen ou long terme)";

export const RM_RAPPORT_EPARGNE_BULLET_LABEL = "Épargne de précaution";

export const RM_RAPPORT_ENDETTEMENT_BULLET_LABEL = "Endettement";

export const RM_RAPPORT_MONTANT_INVESTISSEMENT_BULLET_LABEL =
  "Montant de l'investissement envisagé";

export const RM_RAPPORT_SRI_BULLET_LABEL = "Profil de risque";

/** Panneau → rapport (libellés de puce). */
export const RM_PANEL_TO_RAPPORT_BULLET_LABELS: ReadonlyArray<readonly [string, string]> = [
  [RM_PANEL_REVENUS_BULLET_LABEL, RM_RAPPORT_REVENUS_BULLET_LABEL],
  [RM_PANEL_IMMOBILIER_BULLET_LABEL, RM_RAPPORT_IMMOBILIER_BULLET_LABEL],
  [RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL, RM_RAPPORT_VALEURS_MOBILIERES_BULLET_LABEL],
  [RM_PANEL_EPARGNE_BULLET_LABEL, RM_RAPPORT_EPARGNE_BULLET_LABEL],
  [RM_PANEL_ENDETTEMENT_BULLET_LABEL, RM_RAPPORT_ENDETTEMENT_BULLET_LABEL],
  [RM_PANEL_MONTANT_INVESTISSEMENT_BULLET_LABEL, RM_RAPPORT_MONTANT_INVESTISSEMENT_BULLET_LABEL],
  [RM_RECAP_SITUATION_SRI_BULLET_LABEL, RM_RAPPORT_SRI_BULLET_LABEL],
];

/** Anciens libellés panneau → rapport (brouillons). */
export const RM_LEGACY_PANEL_TO_RAPPORT_BULLET_LABELS: ReadonlyArray<readonly [string, string]> = [
  [
    "Immobilier (à détailler si besoin, résidence principale, secondaire, locative avec revenus associés)",
    RM_RAPPORT_IMMOBILIER_BULLET_LABEL,
  ],
  ["Épargne de précaution", RM_RAPPORT_EPARGNE_BULLET_LABEL],
];

export const RM_RECAP_SITUATION_BULLET_LABELS = [
  "Classification",
  "Âge",
  "Résidence fiscale",
  "Situation matrimoniale",
  "Nombre d'enfants",
  RM_PANEL_REVENUS_BULLET_LABEL,
  RM_PANEL_IMMOBILIER_BULLET_LABEL,
  RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL,
  RM_PANEL_EPARGNE_BULLET_LABEL,
  RM_PANEL_ENDETTEMENT_BULLET_LABEL,
  RM_PANEL_MONTANT_INVESTISSEMENT_BULLET_LABEL,
  RM_RECAP_SITUATION_SRI_BULLET_LABEL,
  "Appétences ESG",
] as const;

/** Puces vides affichées avec « : » dans le panneau dossier. */
export const RM_PANEL_BULLET_LABELS_EMPTY_WITH_COLON: readonly string[] = [
  "Nombre d'enfants",
  RM_PANEL_REVENUS_BULLET_LABEL,
  RM_PANEL_IMMOBILIER_BULLET_LABEL,
  RM_PANEL_VALEURS_MOBILIERES_BULLET_LABEL,
  RM_PANEL_EPARGNE_BULLET_LABEL,
  RM_PANEL_ENDETTEMENT_BULLET_LABEL,
  RM_PANEL_MONTANT_INVESTISSEMENT_BULLET_LABEL,
  "Appétences ESG",
];
