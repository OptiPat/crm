import { describe, expect, it } from "vitest";
import { RM_PAGE2_ROW_ANALYSE_TITLE } from "@/lib/souscription-cif/rapport-mission-page2";
import { splitRmRecapRowsAtAnalyse } from "@/lib/souscription-cif/rm-recap-table-split";

describe("splitRmRecapRowsAtAnalyse", () => {
  it("ne modifie pas les lignes sans analyse", () => {
    const rows = [
      { title: "RAPPEL DES OBJECTIFS", contentSegments: [] },
      { title: "RÉPONSE AUX QUESTIONS POSÉES", contentSegments: [] },
    ];
    const split = splitRmRecapRowsAtAnalyse(rows);
    expect(split.before).toEqual(rows);
    expect(split.analyse).toBeNull();
    expect(split.after).toEqual([]);
  });

  it("isole la ligne analyse entre objectifs et réponses", () => {
    const rows = [
      { title: "RAPPEL DES OBJECTIFS", contentSegments: [] },
      { title: RM_PAGE2_ROW_ANALYSE_TITLE, contentSegments: [{ kind: "text", value: "Long" }] },
      { title: "RÉPONSE AUX QUESTIONS POSÉES", contentSegments: [] },
    ];
    const split = splitRmRecapRowsAtAnalyse(rows);
    expect(split.before.map((r) => r.title)).toEqual(["RAPPEL DES OBJECTIFS"]);
    expect(split.analyse?.title).toBe(RM_PAGE2_ROW_ANALYSE_TITLE);
    expect(split.after.map((r) => r.title)).toEqual(["RÉPONSE AUX QUESTIONS POSÉES"]);
  });
});
