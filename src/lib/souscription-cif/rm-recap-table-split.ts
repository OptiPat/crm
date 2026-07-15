import {
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_ADAPTATION_TITLE,
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_CONNAISSANCES_TITLE,
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_OBJECTIFS_TITLE,
} from "@/lib/souscription-cif/annexes-capital-invest-recap-table";
import {
  ANNEXES_G3F_RECAP_ROW_ADAPTATION_TITLE,
  ANNEXES_G3F_RECAP_ROW_OBJECTIFS_TITLE,
  ANNEXES_G3F_RECAP_ROW_RISQUE_TITLE,
} from "@/lib/souscription-cif/annexes-g3f-recap-table";
import {
  ANNEXES_SCPI_RECAP_ROW_ADAPTATION_TITLE,
  ANNEXES_SCPI_RECAP_ROW_OBJECTIFS_TITLE,
} from "@/lib/souscription-cif/annexes-scpi-recap-table";
import {
  RM_PAGE2_ROW_ANALYSE_TITLE,
  RM_PAGE2_ROW_MISSIONS_TITLE,
  RM_PAGE2_ROW_OBJECTIFS_TITLE,
} from "@/lib/souscription-cif/rapport-mission-page2";
import { RM_RECAP_ROW_SITUATION_TITLE } from "@/lib/souscription-cif/rapport-mission-recap-table";

export type RmRecapSplitRow = {
  title: string;
  contentSegments: unknown[];
};

export type RmRecapPagedChunk<T extends RmRecapSplitRow> =
  | { kind: "table"; rows: T[] }
  | { kind: "isolated"; row: T };

/**
 * Lignes récap dont le verbatim peut être long (saisie utilisateur ou modèle dense).
 * Rendues en mini-table isolée : Paged.js supprime parfois une <tr> au milieu d'un
 * grand <table>, ou décale le texte dans la colonne titre au saut de page.
 */
export const CIF_RECAP_ISOLATED_ROW_TITLES: ReadonlySet<string> = new Set([
  RM_RECAP_ROW_SITUATION_TITLE,
  RM_PAGE2_ROW_MISSIONS_TITLE,
  RM_PAGE2_ROW_OBJECTIFS_TITLE,
  RM_PAGE2_ROW_ANALYSE_TITLE,
  ANNEXES_SCPI_RECAP_ROW_ADAPTATION_TITLE,
  ANNEXES_SCPI_RECAP_ROW_OBJECTIFS_TITLE,
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_ADAPTATION_TITLE,
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_OBJECTIFS_TITLE,
  ANNEXES_CAPITAL_INVEST_RECAP_ROW_CONNAISSANCES_TITLE,
  ANNEXES_G3F_RECAP_ROW_ADAPTATION_TITLE,
  ANNEXES_G3F_RECAP_ROW_OBJECTIFS_TITLE,
  ANNEXES_G3F_RECAP_ROW_RISQUE_TITLE,
]);

/**
 * Découpe les lignes récap en blocs table + lignes isolées pour l'export Paged.js.
 */
export function chunkRmRecapRowsForPaged<T extends RmRecapSplitRow>(
  rows: readonly T[],
  isolatedTitles: ReadonlySet<string> = CIF_RECAP_ISOLATED_ROW_TITLES
): RmRecapPagedChunk<T>[] {
  const chunks: RmRecapPagedChunk<T>[] = [];
  let tableRows: T[] = [];

  const flushTable = () => {
    if (tableRows.length === 0) return;
    chunks.push({ kind: "table", rows: tableRows });
    tableRows = [];
  };

  for (const row of rows) {
    if (isolatedTitles.has(row.title)) {
      flushTable();
      chunks.push({ kind: "isolated", row });
    } else {
      tableRows.push(row);
    }
  }
  flushTable();

  return chunks;
}

/** @deprecated Utiliser chunkRmRecapRowsForPaged */
export function splitRmRecapRowsAtAnalyse<T extends RmRecapSplitRow>(rows: readonly T[]) {
  const chunks = chunkRmRecapRowsForPaged(rows, new Set([RM_PAGE2_ROW_ANALYSE_TITLE]));
  const before: T[] = [];
  let analyse: T | null = null;
  const after: T[] = [];

  for (const chunk of chunks) {
    if (chunk.kind === "table") {
      if (analyse) after.push(...chunk.rows);
      else before.push(...chunk.rows);
    } else if (!analyse) {
      analyse = chunk.row;
    } else {
      after.push(chunk.row);
    }
  }

  return { before, analyse, after };
}
