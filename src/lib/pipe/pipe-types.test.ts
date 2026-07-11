import { describe, expect, it } from "vitest";
import {
  canBePipeParent,
  defaultPipeStage,
  isPipeStage,
  isPipeType,
  pipeTypeUsesStage,
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

  it("valide le formulaire", () => {
    expect(
      validatePipeForm({
        titre: "",
        contactId: 1,
        pipeType: "AFFAIRE",
        stage: "PROSPECTION",
      })
    ).toMatch(/titre/i);
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
