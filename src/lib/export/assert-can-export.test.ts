import { describe, expect, it } from "vitest";
import { assertCanExport, ExportNotAllowedError } from "./assert-can-export";

describe("assertCanExport", () => {
  it("ne fait rien quand l'export est autorisé", () => {
    expect(() => assertCanExport(true)).not.toThrow();
  });

  it("lève ExportNotAllowedError quand l'export est interdit", () => {
    expect(() => assertCanExport(false)).toThrow(ExportNotAllowedError);
    expect(() => assertCanExport(false)).toThrow(/Export non autorisé/);
  });
});
