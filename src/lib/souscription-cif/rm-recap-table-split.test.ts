import { describe, expect, it } from "vitest";
import {
  ANNEXES_SCPI_RECAP_ROW_OBJECTIFS_TITLE,
  ANNEXES_SCPI_RECAP_ROW_ADAPTATION_TITLE,
} from "@/lib/souscription-cif/annexes-scpi-recap-table";
import {
  RM_PAGE2_ROW_ANALYSE_TITLE,
  RM_PAGE2_ROW_OBJECTIFS_TITLE,
} from "@/lib/souscription-cif/rapport-mission-page2";
import { RM_RECAP_ROW_SITUATION_TITLE } from "@/lib/souscription-cif/rapport-mission-recap-table";
import { chunkRmRecapRowsForPaged } from "@/lib/souscription-cif/rm-recap-table-split";

describe("chunkRmRecapRowsForPaged", () => {
  it("ne modifie pas les lignes sans titre isolé", () => {
    const rows = [
      { title: "RAPPEL DE LA DEMANDE", contentSegments: [] },
      { title: "RÉPONSE AUX QUESTIONS POSÉES", contentSegments: [] },
    ];
    expect(chunkRmRecapRowsForPaged(rows)).toEqual([{ kind: "table", rows }]);
  });

  it("isole situation, objectifs et analyse en mini-tables", () => {
    const rows = [
      { title: "RAPPEL DE LA DEMANDE", contentSegments: [] },
      { title: RM_RECAP_ROW_SITUATION_TITLE, contentSegments: [{ kind: "text", value: "Long" }] },
      { title: RM_PAGE2_ROW_OBJECTIFS_TITLE, contentSegments: [] },
      { title: RM_PAGE2_ROW_ANALYSE_TITLE, contentSegments: [] },
      { title: "RÉPONSE AUX QUESTIONS POSÉES", contentSegments: [] },
    ];
    const chunks = chunkRmRecapRowsForPaged(rows);
    expect(chunks).toEqual([
      { kind: "table", rows: [{ title: "RAPPEL DE LA DEMANDE", contentSegments: [] }] },
      { kind: "isolated", row: rows[1] },
      { kind: "isolated", row: rows[2] },
      { kind: "isolated", row: rows[3] },
      { kind: "table", rows: [{ title: "RÉPONSE AUX QUESTIONS POSÉES", contentSegments: [] }] },
    ]);
  });

  it("isole les lignes variables du tableau récap annexes SCPI", () => {
    const rows = [
      { title: ANNEXES_SCPI_RECAP_ROW_ADAPTATION_TITLE, contentSegments: [] },
      { title: ANNEXES_SCPI_RECAP_ROW_OBJECTIFS_TITLE, contentSegments: [] },
      { title: "La durée d'investissement est conforme à la situation particulière du client ?", contentSegments: [] },
    ];
    const chunks = chunkRmRecapRowsForPaged(rows);
    expect(chunks.map((c) => c.kind)).toEqual(["isolated", "isolated", "table"]);
  });
});
