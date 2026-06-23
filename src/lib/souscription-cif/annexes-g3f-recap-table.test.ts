import { describe, expect, it } from "vitest";
import {
  ANNEXES_G3F_RECAP_ROW_CONNAISSANCES_CONTENT,
  ANNEXES_G3F_RECAP_ROW_DUREE_CONTENT,
  ANNEXES_G3F_RECAP_ROW_OBJECTIFS_CONTENT,
  ANNEXES_G3F_RECAP_ROW_REEXAMEN_CONTENT,
  ANNEXES_G3F_RECAP_ROW_RISQUE_CONTENT,
  ANNEXES_G3F_RECAP_ROW_TEMPLATES,
} from "@/lib/souscription-cif/annexes-g3f-recap-table";

describe("annexes-g3f-recap-table", () => {
  it("expose 6 lignes d'adéquation G3F", () => {
    expect(ANNEXES_G3F_RECAP_ROW_TEMPLATES).toHaveLength(6);
  });

  it("contient les formulations G3F attendues", () => {
    expect(ANNEXES_G3F_RECAP_ROW_OBJECTIFS_CONTENT).toContain(
      "réduction d'impôt immédiate"
    );
    expect(ANNEXES_G3F_RECAP_ROW_DUREE_CONTENT).toContain("moyen/long terme");
    expect(ANNEXES_G3F_RECAP_ROW_CONNAISSANCES_CONTENT).toContain("présent rapport");
    expect(ANNEXES_G3F_RECAP_ROW_RISQUE_CONTENT).toContain("épargne de précaution");
    expect(ANNEXES_G3F_RECAP_ROW_RISQUE_CONTENT).toContain("faible partie");
    expect(ANNEXES_G3F_RECAP_ROW_REEXAMEN_CONTENT).toContain("Non.");
    expect(ANNEXES_G3F_RECAP_ROW_REEXAMEN_CONTENT).toContain("conservation des parts pendant 5 ans");
  });
});
