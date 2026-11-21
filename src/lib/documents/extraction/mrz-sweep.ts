import type { CropRegion } from "@/lib/documents/extraction/image-crop";

/**
 * Balayage de secours de la MRZ : quand les découpes fixes n'ont rien donné de vérifié
 * (scan tourné, double page de passeport, carte qui ne remplit pas l'image), on essaie
 * plusieurs orientations et plusieurs zones, et on garde la lecture la mieux notée
 * (clés de contrôle ICAO). Arrêt dès qu'une lecture est vérifiée.
 */

/** Orientations testées, dans l'ordre (0 = telle quelle). */
export const MRZ_SWEEP_ROTATIONS = [0, 90, 270, 180] as const;
export type MrzSweepRotation = (typeof MRZ_SWEEP_ROTATIONS)[number];

/**
 * Zones testées : bande basse sur toute la largeur, puis sur chaque moitié
 * (double page de passeport : MRZ en bas de la page de droite ou de gauche).
 */
export const MRZ_SWEEP_REGIONS: CropRegion[] = [
  { topRatio: 0.78, heightRatio: 0.22 },
  { topRatio: 0.6, heightRatio: 0.4 },
  { topRatio: 0.78, heightRatio: 0.22, leftRatio: 0.5, widthRatio: 0.5 },
  { topRatio: 0.6, heightRatio: 0.4, leftRatio: 0.5, widthRatio: 0.5 },
  { topRatio: 0.78, heightRatio: 0.22, leftRatio: 0, widthRatio: 0.5 },
  { topRatio: 0.6, heightRatio: 0.4, leftRatio: 0, widthRatio: 0.5 },
];

export type MrzSweepDeps = {
  rotate: (dataUrl: string, degrees: 90 | 180 | 270) => Promise<string>;
  crop: (dataUrl: string, region: CropRegion) => Promise<string>;
  recognizeMrz: (dataUrl: string) => Promise<string>;
  score: (text: string) => number;
  verifiedScore: number;
};

/** Renvoie le meilleur texte MRZ trouvé (éventuellement vide) et son score. */
export async function sweepMrz(
  dataUrl: string,
  deps: MrzSweepDeps
): Promise<{ text: string; score: number }> {
  let best = { text: "", score: -1 };

  for (const rotation of MRZ_SWEEP_ROTATIONS) {
    const oriented = rotation === 0 ? dataUrl : await deps.rotate(dataUrl, rotation);
    for (const region of MRZ_SWEEP_REGIONS) {
      let text = "";
      try {
        text = await deps.recognizeMrz(await deps.crop(oriented, region));
      } catch {
        continue; // zone illisible : on passe à la suivante
      }
      const score = deps.score(text);
      if (score > best.score) best = { text, score };
      if (best.score >= deps.verifiedScore) return best;
    }
  }
  return best;
}
