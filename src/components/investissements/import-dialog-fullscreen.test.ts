import { describe, expect, it } from "vitest";
import { commitImportDateFieldChange } from "@/components/investissements/import-dialog-fullscreen";

describe("commitImportDateFieldChange", () => {
  it("retourne null si vide et déjà sans date", () => {
    expect(commitImportDateFieldChange("", undefined)).toBeNull();
  });

  it("retourne undefined pour effacer une date existante", () => {
    expect(
      commitImportDateFieldChange("", "2024-06-15T00:00:00.000Z")
    ).toBeUndefined();
  });

  it("retourne une ISO pour une date valide", () => {
    expect(
      commitImportDateFieldChange("2024-06-15", undefined)
    ).toBe("2024-06-15T00:00:00.000Z");
  });

  it("retourne null si la date est inchangée", () => {
    expect(
      commitImportDateFieldChange(
        "2024-06-15",
        "2024-06-15T00:00:00.000Z"
      )
    ).toBeNull();
  });
});
