/** Provenance d'un point d'historique, telle que l'écran client l'annonce. */
export type ValorisationSource = "cabinet" | "client";

export interface ValorisationPoint {
  dateTs: number;
  montantCentimes: number;
  revenuPercuCentimes?: number | null;
  source: ValorisationSource;
}

/** Point d'historique tel que le moteur Rust le transmet. */
export interface ValorisationPointDto {
  investissementId: number;
  dateTs: number;
  montantCentimes: number;
  revenuPercuCentimes?: number | null;
  source: string;
}

/** Déclaration saisie sur l'espace mais pas encore reprise dans le CRM. */
export interface DeclarationEnAttente {
  dateTs: number;
  montantCentimes: number;
  revenuPercuCentimes?: number | null;
}

export type ValorisationHistoryById = Map<number, ValorisationPoint[]>;

/** Deux saisies du même jour ne font qu'une ligne, quelle que soit l'heure. */
function jour(dateTs: number): number {
  return Math.floor(dateTs / 86_400);
}

function normaliserSource(source: string): ValorisationSource {
  return source === "client" ? "client" : "cabinet";
}

/**
 * Historique complet par placement : ce que le cabinet a valorisé et ce que le
 * client a déclaré, fusionnés et étiquetés.
 *
 * Le client ne voyait auparavant que ses propres déclarations dès qu'il en
 * faisait une, alors que le montant affiché en tête pouvait venir du cabinet :
 * deux chiffres sans lien apparent.
 *
 * Une déclaration encore en attente d'import prime sur le point du même jour
 * venu du CRM : c'est la saisie la plus récente du client.
 */
export function buildValorisationHistories(
  points: ValorisationPointDto[],
  enAttenteParInvestissement?: Map<number, DeclarationEnAttente[]>
): ValorisationHistoryById {
  const parPlacement = new Map<number, Map<number, ValorisationPoint>>();

  const bucket = (investissementId: number) => {
    const existant = parPlacement.get(investissementId);
    if (existant) return existant;
    const cree = new Map<number, ValorisationPoint>();
    parPlacement.set(investissementId, cree);
    return cree;
  };

  for (const point of points) {
    bucket(point.investissementId).set(jour(point.dateTs), {
      dateTs: point.dateTs,
      montantCentimes: point.montantCentimes,
      revenuPercuCentimes: point.revenuPercuCentimes ?? undefined,
      source: normaliserSource(point.source),
    });
  }

  for (const [investissementId, declarations] of enAttenteParInvestissement ??
    new Map<number, DeclarationEnAttente[]>()) {
    for (const declaration of declarations) {
      bucket(investissementId).set(jour(declaration.dateTs), {
        dateTs: declaration.dateTs,
        montantCentimes: declaration.montantCentimes,
        revenuPercuCentimes: declaration.revenuPercuCentimes ?? undefined,
        source: "client",
      });
    }
  }

  const resultat: ValorisationHistoryById = new Map();
  for (const [investissementId, jours] of parPlacement) {
    resultat.set(
      investissementId,
      [...jours.values()].sort((a, b) => a.dateTs - b.dateTs)
    );
  }
  return resultat;
}
