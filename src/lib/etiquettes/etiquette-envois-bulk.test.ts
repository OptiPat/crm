import { describe, expect, it } from "vitest";
import { getEnvoisBulkRemoveLabel } from "./etiquette-envois-bulk";

describe("getEnvoisBulkRemoveLabel", () => {
  it("libellés par action", () => {
    expect(getEnvoisBulkRemoveLabel("cancel")).toBe("Retirer la sélection");
    expect(getEnvoisBulkRemoveLabel("dismiss")).toBe("Ne plus proposer la sélection");
    expect(getEnvoisBulkRemoveLabel("dismissFollowup")).toContain("suivi");
  });
});
