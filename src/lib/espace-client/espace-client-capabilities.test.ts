import { describe, expect, it } from "vitest";
import { parseEspaceClientActive } from "./espace-client-capabilities";

describe("parseEspaceClientActive", () => {
  it("retourne false si absent", () => {
    expect(parseEspaceClientActive(null)).toBe(false);
    expect(parseEspaceClientActive("")).toBe(false);
  });

  it("accepte les valeurs truthy", () => {
    expect(parseEspaceClientActive("1")).toBe(true);
    expect(parseEspaceClientActive("true")).toBe(true);
    expect(parseEspaceClientActive("oui")).toBe(true);
  });
});
