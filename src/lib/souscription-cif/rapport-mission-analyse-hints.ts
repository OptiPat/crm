/** Aide sous le textarea « Analyse de la situation » (rapport de mission). */

export const RM_ANALYSE_SITUATION_INTRO =
  "Tableau page 3 — après la phrase sur le RIO. Retranscrire la démarche intellectuelle : ce que le client vous a dit au premier entretien (R1) et en quoi la préconisation répond à son projet.";

export const RM_ANALYSE_SITUATION_EXAMPLES_SCPI: readonly string[] = [
  "Exemple : le client souhaite se reconvertir professionnellement d'ici X années — expliquer pourquoi les SCPI l'aideraient dans son projet.",
  "Exemple : héritage, donation, préparation de la retraite, etc.",
  "Autre exemple : couplage Malraux, SCPI, assurance-vie, retraite dans 15 ans, études des enfants, etc.",
];

export const RM_ANALYSE_SITUATION_EXAMPLES_CAPITAL_INVEST: readonly string[] = [
  "Capital investissement avec réduction d'impôt : rattacher l'analyse à l'objectif « Optimiser la fiscalité de vos revenus » (Recueil / QPI) et expliquer en quoi la FCPI ou le FIP répond à cette attente.",
  "Si le client souscrit déjà régulièrement (FCPI, FIP…), le préciser et montrer la cohérence avec son historique de souscription.",
  "Si une augmentation de revenus motive la démarche, la mentionner et lier la préconisation au surplus fiscal à optimiser.",
  "Si le client est expérimenté ou souscrit déjà : préciser depuis combien d'années (ex. « régulièrement depuis 5 ans ») et en quoi la nouvelle souscription prolonge ou complète cette démarche.",
];

export const RM_ANALYSE_SITUATION_EXAMPLES_G3F: readonly string[] = [
  "Exemple : le client souhaite se reconvertir professionnellement d'ici X années — expliquer pourquoi le Girardin industriel l'aiderait dans son projet (réduction d'impôt immédiate, horizon moyen terme, apport maîtrisé).",
  "Autre exemple : couplage Malraux, Girardin, SCPI, assurance-vie, retraite dans 15 ans, études des enfants, etc. — montrer la complémentarité dans l'allocation globale.",
  "Girardin industriel avec réduction d'impôt : rattacher l'analyse à l'objectif « Optimisation fiscale / Réduction d'impôt » (Recueil / QPI) et expliquer en quoi le dispositif Girardin industriel (G3F) répond à cette attente (réduction immédiate, effet de levier, plafond niche).",
  "Si le client a déjà recours à des dispositifs défiscalisants (Girardin, FCPI, FIP, Malraux…), le préciser et montrer la cohérence avec son historique et le plafond des niches fiscales.",
  "Si une augmentation de revenus motive la démarche, la mentionner et lier la préconisation au montant d'impôt estimé et à la réduction d'impôt souhaitée.",
  "Si le client est expérimenté ou souscrit déjà : préciser depuis combien d'années (ex. « régulièrement depuis 5 ans ») et en quoi la nouvelle souscription prolonge ou complète cette démarche.",
];

export function getRapportMissionAnalyseExamples(
  productType: "scpi" | "capital-investissement" | "g3f"
): readonly string[] {
  if (productType === "capital-investissement") {
    return RM_ANALYSE_SITUATION_EXAMPLES_CAPITAL_INVEST;
  }
  if (productType === "g3f") {
    return RM_ANALYSE_SITUATION_EXAMPLES_G3F;
  }
  return RM_ANALYSE_SITUATION_EXAMPLES_SCPI;
}
