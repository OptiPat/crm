import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  loadEspaceDemandeOptions,
  resolveEspaceDemandeSelection,
} from "./espace-demande-options";

vi.mock("@/lib/pipe/pipe-checklist-template", () => ({
  loadPipeChecklistTemplates: vi.fn(),
}));

vi.mock("@/lib/pipe/r3-immo-checklist-template", () => ({
  loadR3ImmoChecklistTemplate: vi.fn(() =>
    Promise.reject(new Error("mock"))
  ),
  cloneDefaultR3ImmoChecklistTemplate: vi.fn(() => ({
    sections: [],
    items: [{ id: "cni", section: "Id", label: "CNI", rule: "always" }],
  })),
}));

const loadPipeChecklistTemplates = vi.mocked(
  (await import("@/lib/pipe/pipe-checklist-template")).loadPipeChecklistTemplates
);

describe("espace-demande-options", () => {
  beforeEach(() => {
    loadPipeChecklistTemplates.mockReset();
    loadPipeChecklistTemplates.mockResolvedValue({
      R1: [{ id: "avis_imposition", label: "Avis d'imposition", profiles: ["base"] }],
      R2: [],
      R3: [{ id: "cni", label: "CNI", profiles: ["base"] }],
    });
  });

  it("agrège R1, R3 placements et R3 immo", async () => {
    const options = await loadEspaceDemandeOptions();
    expect(options.some((o) => o.templateKey === "R1:avis_imposition")).toBe(true);
    expect(options.some((o) => o.templateKey === "R3:cni")).toBe(true);
    expect(options.some((o) => o.templateKey === "R3_IMMO:cni")).toBe(true);
    expect(options.some((o) => o.templateKey === "custom")).toBe(true);
  });

  it("résout une sélection custom", async () => {
    const options = await loadEspaceDemandeOptions();
    expect(
      resolveEspaceDemandeSelection(options, "custom", "Attestation employeur")
    ).toEqual({
      libelle: "Attestation employeur",
      typeDocument: "AUTRE",
      templateKey: null,
    });
  });
});
