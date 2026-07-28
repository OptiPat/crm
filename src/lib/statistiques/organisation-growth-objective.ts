/**
 * Calculateur d'objectif de croissance — pour le tableau interactif (panneau Organisation).
 *
 * Fonction pure : pas de connaissance des contacts, juste des nombres déjà calculés ailleurs
 * (attrition, taux, volume perso/équipe). Croissance visée, attrition visée, taux visés et volumes
 * visés sont des paramètres libres (saisis par l'utilisateur dans l'UI) — pas figés sur des valeurs
 * observées, pour permettre une vraie simulation (« et si mon attrition tombait à 40 % et mon taux
 * d'actifs équipe montait à 70 % ? »).
 *
 * Modèle d'attrition (parrainages) : on ne sait pas à l'avance ce que deviendra un parrainage
 * donné (il peut se désinscrire dans l'année comme n'importe qui d'autre) — le taux d'attrition
 * visé est donc appliqué à TOUT le pool de l'exercice (base existante + nouvelles recrues), pas
 * seulement à la base existante.
 *
 * Effectif final = (base + recrues) × (1 − attrition %) ⟺
 * recrues nécessaires = base × [ (1 + croissance visée %) / (1 − attrition %) − 1 ].
 *
 * Modèle des taux (actifs équipe, parraineurs) : DIRECT, pas d'ajustement relatif à un historique
 * observé. Chaque taux visé s'applique une seule fois à l'effectif correspondant :
 *
 * actifs équipe visés = effectif équipe visé (hors soi) × taux d'actifs équipe visé
 * parraineurs visés   = effectif visé (soi compris)     × taux de parraineurs visé
 *
 * La croissance visée (%) n'intervient qu'UNE SEULE fois, dans le calcul de l'effectif visé
 * (`targetHeadcount`) — elle n'est PAS réappliquée une seconde fois sur les actifs équipe ou les
 * parraineurs (une version précédente le faisait par erreur, ce qui doublait l'effet de la
 * croissance sur ces deux lignes et rendait le calcul illisible).
 *
 * Autre conséquence : ce calcul ne dépend plus de vos propres actifs équipe / parraineurs observés
 * (juste de l'effectif et du taux visé), donc il n'y a plus de risque de mélanger deux bases de
 * population différentes (ex. un « taux de parraineurs » mesuré sur une population large appliqué à
 * un effectif compté sur une population plus restreinte) : le taux et l'effectif utilisés sont
 * toujours ceux de CE calcul, pas une valeur observée externe.
 *
 * L'effectif (compte de personnes) est arrondi pour l'affichage, mais le VOLUME est calculé à
 * partir de la valeur non arrondie : sinon le volume ne bougerait que par paliers entiers (un saut
 * de tout le volume moyen équipe à chaque franchissement d'une personne), au lieu de varier en
 * continu quand on modifie la croissance ou le taux visé.
 *
 * L'attrition n'intervient QUE dans le calcul des parrainages nécessaires (l'effort de
 * recrutement) — elle ne change jamais l'effectif actif équipe ni le volume visé pour un même
 * objectif de croissance : par construction, on recrute davantage pour compenser l'attrition, donc
 * le résultat final (effectif, volume) est le même quel que soit le niveau d'attrition, seul l'effort
 * pour y arriver change.
 *
 * Le ratio « parrainages / parraineur » n'est pas un levier indépendant : une fois les parraineurs
 * déterminés (effectif × taux), il est déduit (`parrainages nécessaires / parraineurs nécessaires`)
 * et affiché à titre indicatif (« à ce rythme, chaque parraineur devrait faire ~X parrainages »).
 *
 * Le tableau interactif n'a qu'une colonne visée (« Objectif »/« Groupe ») — il n'y a plus de
 * scénario « Stable (0 %) » séparé (colonne retirée) ; seuls les résultats correspondant à
 * `targetGrowthPercent` sont exposés.
 */
export type GrowthObjectiveInput = {
  /** Base actuelle de consultants, soi compris (effectif réseau, pas seulement les actifs). */
  currentConsultantCount: number;
  /** Attrition visée (%) — paramètre libre, défaut = attrition observée. */
  attritionPercent: number;
  /** Croissance visée (%) — paramètre libre, saisi par l'utilisateur. */
  targetGrowthPercent: number;
  /** Taux de parraineurs visé (%) — paramètre libre, appliqué à l'effectif (soi compris). */
  targetSponsorsRatePercent?: number | null;

  /** Volume personnel actuel (réel, exercice courant) — pour la colonne « Actuel ». */
  currentPersonalVolume?: number | null;
  /** Volume personnel visé — paramètre libre, défaut = volume personnel actuel. */
  targetPersonalVolume?: number | null;
  /** Volume moyen par actif équipe actuel (hors soi) — pour la colonne « Actuel ». */
  currentTeamAverageVolume?: number | null;
  /** Volume moyen par actif équipe visé — paramètre libre, défaut = volume moyen équipe actuel. */
  targetTeamAverageVolume?: number | null;
  /** Nombre d'actifs équipe actuel (hors soi, réel) — pour la colonne « Actuel » uniquement. */
  currentTeamActiveConsultantCount?: number | null;
  /** Taux d'actifs équipe visé (%) — paramètre libre, appliqué à l'effectif équipe (hors soi). */
  targetTeamActiveRatePercent?: number | null;
};

export type GrowthObjectiveResult = {
  /**
   * Effectif à la fin de l'exercice si l'objectif de croissance est atteint — À NE PAS
   * confondre avec `recruitsForTarget` (nombre de parrainages, pas un effectif) : les deux
   * peuvent coïncider numériquement par hasard selon les valeurs.
   */
  targetHeadcount: number;
  /** Parrainages bruts nécessaires pour atteindre la croissance visée (compense aussi l'attrition). */
  recruitsForTarget: number;
  /** Parraineurs nécessaires (effectif visé × taux visé) — colonne Objectif/Groupe. */
  sponsorsForTarget: number | null;
  /** Ratio parrainages/parraineur impliqué par `sponsorsForTarget` — dérivé, pas un levier. */
  impliedRatioForTarget: number | null;

  /** Effectif actif équipe (hors soi) avec effectif visé — colonne Objectif/Groupe. */
  targetTeamActiveCount: number | null;
  /**
   * Version non arrondie de `targetTeamActiveCount` — utilisée en interne pour le volume (afin
   * qu'il varie en continu, cf. JSDoc en tête de fichier), et exposée ici pour l'affichage : sans
   * elle, le produit affiché « effectif × volume moyen » ne redonnerait pas exactement le volume
   * organisation affiché (écart d'arrondi visible en faisant le calcul à la main).
   */
  targetTeamActiveCountRaw: number | null;
  /** Volume total actuel réel (perso actuel + équipe actuelle). */
  currentOrgVolume: number | null;
  /** Volume total visé (perso visé + équipe visée × volume équipe visé). */
  targetOrgVolume: number | null;
};

export function computeGrowthObjective(input: GrowthObjectiveInput): GrowthObjectiveResult {
  const n = Math.max(0, input.currentConsultantCount);
  const attritionPercent = Math.max(0, input.attritionPercent);
  const targetGrowthPercent = input.targetGrowthPercent;

  // Taux de survie sur le pool complet (existants + nouvelles recrues) — plancher à 1 % pour
  // éviter une division par zéro/négatif si l'attrition visée atteint ou dépasse 100 %.
  const survivalRate = Math.max(0.01, 1 - attritionPercent / 100);

  const recruitsForTarget = Math.max(
    0,
    Math.ceil(n * ((1 + targetGrowthPercent / 100) / survivalRate - 1))
  );
  const targetHeadcount = Math.round(n * (1 + targetGrowthPercent / 100));

  // Parraineurs : effectif (soi compris) × taux visé, appliqué une seule fois — pas de double
  // application de la croissance (elle est déjà dans targetHeadcount).
  const sponsorsRate =
    input.targetSponsorsRatePercent != null ? Math.max(0, input.targetSponsorsRatePercent) / 100 : null;
  const sponsorsForTarget = sponsorsRate != null ? Math.round(targetHeadcount * sponsorsRate) : null;
  const impliedRatioForTarget =
    sponsorsForTarget != null && sponsorsForTarget > 0 ? recruitsForTarget / sponsorsForTarget : null;

  const currentOrgVolume =
    input.currentPersonalVolume != null &&
    input.currentTeamAverageVolume != null &&
    input.currentTeamActiveConsultantCount != null
      ? input.currentPersonalVolume + input.currentTeamActiveConsultantCount * input.currentTeamAverageVolume
      : null;

  // Effectif équipe hors soi (soi = 1 personne, supposée constante) — même logique une seule fois,
  // pas de double application de la croissance.
  const targetTeamHeadcount = Math.max(0, targetHeadcount - 1);

  // Valeur non arrondie — utilisée pour le volume, afin qu'il varie en continu avec le curseur de
  // croissance/taux plutôt que par paliers (un arrondi à l'entier trop tôt fait « sauter » le
  // volume par blocs entiers de volume moyen équipe à chaque franchissement d'une personne).
  const teamActiveRate =
    input.targetTeamActiveRatePercent != null ? Math.max(0, input.targetTeamActiveRatePercent) / 100 : null;
  const targetTeamActiveCountRaw = teamActiveRate != null ? targetTeamHeadcount * teamActiveRate : null;

  // Valeur arrondie — pour l'affichage de l'effectif (on ne peut pas avoir « 9,4 personnes »).
  const targetTeamActiveCount = targetTeamActiveCountRaw != null ? Math.round(targetTeamActiveCountRaw) : null;

  const targetOrgVolume =
    input.targetPersonalVolume != null &&
    input.targetTeamAverageVolume != null &&
    targetTeamActiveCountRaw != null
      ? input.targetPersonalVolume + targetTeamActiveCountRaw * input.targetTeamAverageVolume
      : null;

  return {
    targetHeadcount,
    recruitsForTarget,
    sponsorsForTarget,
    impliedRatioForTarget,
    targetTeamActiveCount,
    targetTeamActiveCountRaw,
    currentOrgVolume,
    targetOrgVolume,
  };
}
