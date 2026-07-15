import { RM_PAGE2_ROW_ANALYSE_TITLE } from "@/lib/souscription-cif/rapport-mission-page2";

export type RmRecapSplitRow = {
  title: string;
  contentSegments: unknown[];
};

/**
 * Isole la ligne « Analyse de la situation » du tableau récap.
 *
 * Paged.js peut supprimer entièrement une `<tr>` très haute à l'impression PDF ;
 * on la rend dans une mini-table isolée pour fragmenter le verbatim proprement.
 */
export function splitRmRecapRowsAtAnalyse<T extends RmRecapSplitRow>(rows: readonly T[]) {
  const index = rows.findIndex((row) => row.title === RM_PAGE2_ROW_ANALYSE_TITLE);
  if (index < 0) {
    return { before: [...rows], analyse: null, after: [] as T[] };
  }
  return {
    before: rows.slice(0, index),
    analyse: rows[index]!,
    after: rows.slice(index + 1),
  };
}
