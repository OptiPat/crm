/** Texte type — annexes SCPI, paragraphe Conseil (page 1). */
export const DEFAULT_CONSEIL_TEXT =
  "Afin de vous constituer du patrimoine et de répondre à vos objectifs, je vous conseille de souscrire des parts de SCPI en pleine propriété.";

/** Texte type — annexes SCPI, préconisations détaillées (page 4). */
export const DEFAULT_MES_PRECONISATIONS_TEXT = `Mes préconisations portent sur un investissement global de 30 000 €, répartis ainsi :

La souscription de parts de SCPI de rendement Comète en pleine propriété au comptant pour un montant de 30 000 €, soit 250 € la part x 120 parts = montant total souscrit de 30 000 € ; Avec réinvestissement automatique de 100% des dividendes + 50 €/mois de versements programmés.`;

export function buildDefaultConseil(): string {
  return DEFAULT_CONSEIL_TEXT;
}

export function buildDefaultMesPreconisations(): string {
  return DEFAULT_MES_PRECONISATIONS_TEXT;
}
