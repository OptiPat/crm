import { describe, expect, it } from "vitest";
import {
  buildVersementAffaireTitre,
  defaultVersementComplementaireAffaireStage,
  formatSuiviRdvDisplayLabel,
  formatVersementComplementaireAffaireStageLabel,
  isSuiviPipe,
  isSuiviRdvEntry,
  isVersementComplementaireAffaire,
  SUIVI_RDV_TITRE,
  VERSEMENT_COMPLEMENTAIRE_ACT_LABEL,
  VERSEMENT_COMPLEMENTAIRE_AFFAIRE_STAGE_LABEL,
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

  it("reconnait une affaire versement complementaire enfant du suivi", () => {
    expect(
      isVersementComplementaireAffaire({
        pipe_type: "AFFAIRE",
        parent_pipe_id: 12,
        titre: `${VERSEMENT_COMPLEMENTAIRE_ACT_LABEL} — Jean DUPONT`,
      })
    ).toBe(true);
    expect(
      isVersementComplementaireAffaire({
        pipe_type: "AFFAIRE",
        parent_pipe_id: null,
        titre: `${VERSEMENT_COMPLEMENTAIRE_ACT_LABEL} — Jean DUPONT`,
      })
    ).toBe(false);
    expect(
      isVersementComplementaireAffaire({
        pipe_type: "AFFAIRE",
        parent_pipe_id: 12,
        titre: "Souscription Cristalliance",
      })
    ).toBe(false);
  });

  it("stage par défaut versement = prospection (pas Gagnée)", () => {
    expect(defaultVersementComplementaireAffaireStage()).toBe("PROSPECTION");
  });

  it("badge affaire versement avant mail client", () => {
    const pipe = {
      pipe_type: "AFFAIRE" as const,
      parent_pipe_id: 12,
      titre: `${VERSEMENT_COMPLEMENTAIRE_ACT_LABEL} — Jean DUPONT`,
      stage: "PROSPECTION",
    };
    expect(formatVersementComplementaireAffaireStageLabel(pipe)).toBe(
      VERSEMENT_COMPLEMENTAIRE_AFFAIRE_STAGE_LABEL
    );
    expect(formatVersementComplementaireAffaireStageLabel({ ...pipe, stage: "GAGNEE" })).toBe(
      "Gagnée"
    );
  });
});
