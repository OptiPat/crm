import { describe, expect, it } from "vitest";
import {
  buildNouvelleSouscriptionAffaireTitre,
  buildVersementAffaireTitre,
  defaultVersementComplementaireAffaireStage,
  formatSuiviChildAffaireStageLabel,
  formatSuiviRdvDisplayLabel,
  formatVersementComplementaireAffaireStageLabel,
  isNouvelleSouscriptionAffaire,
  isSuiviChildAffaire,
  isSuiviChildAffaireActLabel,
  isSuiviPipe,
  isSuiviRdvEntry,
  isVersementComplementaireAffaire,
  NOUVELLE_SOUSCRIPTION_ACT_LABEL,
  NOUVELLE_SOUSCRIPTION_AFFAIRE_STAGE_LABEL,
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

describe("pipe-suivi — nouvelle souscription", () => {
  const child = {
    pipe_type: "AFFAIRE" as const,
    parent_pipe_id: 12,
    titre: `${NOUVELLE_SOUSCRIPTION_ACT_LABEL} — Jean DUPONT`,
    stage: "PROSPECTION",
  };

  it("titre l'affaire enfant avec le contact", () => {
    expect(
      buildNouvelleSouscriptionAffaireTitre({
        contact_prenom: "Jean",
        contact_nom: "DUPONT",
        titre: "DUPONT Jean — suivi mai 2026",
      })
    ).toBe("Nouvelle souscription — Jean DUPONT");
  });

  it("reconnait l'affaire enfant, hors cycle R1→R3", () => {
    expect(isNouvelleSouscriptionAffaire(child)).toBe(true);
    expect(isSuiviChildAffaire(child)).toBe(true);
    expect(isVersementComplementaireAffaire(child)).toBe(false);
    expect(isNouvelleSouscriptionAffaire({ ...child, parent_pipe_id: null })).toBe(false);
    expect(isSuiviChildAffaire({ ...child, titre: "SCPI Corum 50 k€" })).toBe(false);
  });

  it("badge souscription en cours puis Gagnée", () => {
    expect(formatSuiviChildAffaireStageLabel(child)).toBe(NOUVELLE_SOUSCRIPTION_AFFAIRE_STAGE_LABEL);
    expect(formatSuiviChildAffaireStageLabel({ ...child, stage: "GAGNEE" })).toBe("Gagnée");
    expect(
      formatSuiviChildAffaireStageLabel({ ...child, titre: "Versement complémentaire — Jean DUPONT" })
    ).toBe(VERSEMENT_COMPLEMENTAIRE_AFFAIRE_STAGE_LABEL);
  });

  it("acte Suivi ouvrant une affaire enfant", () => {
    expect(isSuiviChildAffaireActLabel(NOUVELLE_SOUSCRIPTION_ACT_LABEL)).toBe(true);
    expect(isSuiviChildAffaireActLabel(VERSEMENT_COMPLEMENTAIRE_ACT_LABEL)).toBe(true);
    expect(isSuiviChildAffaireActLabel("Arbitrage")).toBe(false);
  });
});
