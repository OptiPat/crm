import { describe, expect, it } from "vitest";
import {
  canBePipeParent,
  defaultPipeStage,
  isPipeStage,
  isPipeType,
  pipeTypeUsesStage,
  getNextLinearStage,
  isTerminalPipeStage,
  isManualPipeStageChangeAllowed,
  isPipeBoardDropTargetStage,
  formatStageAdvancementMessage,
  defaultPipeTitreFromContact,
  validatePipeForm,
} from "./pipe-types";

describe("pipe-types", () => {
  it("reconnait les types et stages", () => {
    expect(isPipeType("AFFAIRE")).toBe(true);
    expect(isPipeType("INVALID")).toBe(false);
    expect(isPipeStage("R2")).toBe(true);
    expect(isPipeStage("FOO")).toBe(false);
  });

  it("stage réservé aux affaires", () => {
    expect(pipeTypeUsesStage("AFFAIRE")).toBe(true);
    expect(pipeTypeUsesStage("ACTION")).toBe(false);
    expect(defaultPipeStage("AFFAIRE")).toBe("PROSPECTION");
    expect(defaultPipeStage("ACTION")).toBe("");
  });

  it("parents autorisés", () => {
    expect(canBePipeParent("ACTE_GESTION")).toBe(true);
    expect(canBePipeParent("ACTION")).toBe(false);
  });

  it("enchaîne les étapes linéaires", () => {
    expect(getNextLinearStage("PROSPECTION")).toBe("R1");
    expect(getNextLinearStage("R3")).toBe("GAGNEE");
    expect(getNextLinearStage("GAGNEE")).toBeNull();
    expect(isTerminalPipeStage("GAGNEE")).toBe(true);
    expect(isTerminalPipeStage("R2")).toBe(false);
    expect(isManualPipeStageChangeAllowed("GAGNEE")).toBe(true);
    expect(isManualPipeStageChangeAllowed("R1")).toBe(false);
    expect(isPipeBoardDropTargetStage("PERDUE_OU_EN_ATTENTE")).toBe(true);
    expect(isPipeBoardDropTargetStage("R2")).toBe(false);
    expect(formatStageAdvancementMessage("R1")).toBe("Avancement passé à R1");
  });

  it("titre pipe par défaut depuis le contact", () => {
    expect(defaultPipeTitreFromContact({ prenom: "Jean", nom: "DUPONT" })).toBe(
      "Jean DUPONT"
    );
    expect(
      defaultPipeTitreFromContact({ contact_prenom: "Luc", contact_nom: "BERNARD" })
    ).toBe("Luc BERNARD");
  });

  it("valide le formulaire", () => {
    expect(
      validatePipeForm({
        titre: "",
        contactId: 1,
        pipeType: "AFFAIRE",
        stage: "PROSPECTION",
      })
    ).toBeNull();
    expect(
      validatePipeForm({
        titre: "",
        contactId: 0,
        pipeType: "AFFAIRE",
        stage: "PROSPECTION",
      })
    ).toMatch(/contact/i);
    expect(
      validatePipeForm({
        titre: "Test",
        contactId: 0,
        pipeType: "AFFAIRE",
        stage: "PROSPECTION",
      })
    ).toMatch(/contact/i);
    expect(
      validatePipeForm({
        titre: "Test",
        contactId: 1,
        pipeType: "AFFAIRE",
        stage: "BAD",
      })
    ).toMatch(/avancement/i);
    expect(
      validatePipeForm({
        titre: "Appel",
        contactId: 1,
        pipeType: "ACTION",
        stage: "",
      })
    ).toBeNull();
  });
});
