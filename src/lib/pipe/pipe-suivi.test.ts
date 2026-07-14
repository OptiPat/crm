import { describe, expect, it } from "vitest";
import {
  buildVersementAffaireTitre,
  formatSuiviRdvDisplayLabel,
  isSuiviPipe,
  isSuiviRdvEntry,
  SUIVI_RDV_TITRE,
} from "@/lib/pipe/pipe-suivi";

describe("pipe-suivi", () => {
  it("reconnait un pipe Suivi", () => {
    expect(isSuiviPipe({ pipe_type: "ACTE_GESTION" })).toBe(true);
    expect(isSuiviPipe({ pipe_type: "AFFAIRE" })).toBe(false);
  });

  it("identifie un RDV de suivi", () => {
    expect(
      isSuiviRdvEntry({ entry_type: "RDV", titre: SUIVI_RDV_TITRE })
    ).toBe(true);
    expect(isSuiviRdvEntry({ entry_type: "RDV", titre: "R1" })).toBe(false);
  });

  it("formate le libellé RDV de suivi", () => {
    expect(formatSuiviRdvDisplayLabel()).toBe("RDV de suivi");
  });

  it("propose un titre affaire versement", () => {
    expect(
      buildVersementAffaireTitre({
        contact_prenom: "Jean",
        contact_nom: "DUPONT",
        titre: "DUPONT Jean — suivi mai 2026",
      })
    ).toBe("Versement complémentaire — Jean DUPONT");
  });
});
