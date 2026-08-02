import { describe, expect, it } from "vitest";
import {
  arbitrageFicheTemplateLabelFromPath,
  resolveArbitrageFicheTemplateForGeneration,
} from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-fiche-template";
import type { ArbitrageFicheTemplate } from "@/lib/api/tauri-arbitrage-fiche";

describe("arbitrageFicheTemplateLabelFromPath", () => {
  it("utilise le nom du fichier sans extension", () => {
    expect(
      arbitrageFicheTemplateLabelFromPath(
        "C:/Users/nom/Downloads/AV Cristalliance Avenir - Nicolas.pdf"
      )
    ).toBe("AV Cristalliance Avenir - Nicolas");
  });
});

function template(
  id: string,
  overrides: Partial<ArbitrageFicheTemplate> = {}
): ArbitrageFicheTemplate {
  return {
    id,
    label: id,
    isDefault: false,
    createdAt: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("resolveArbitrageFicheTemplateForGeneration", () => {
  it("retourne le seul modèle disponible", () => {
    const only = template("a");
    expect(resolveArbitrageFicheTemplateForGeneration([only])?.id).toBe("a");
  });

  it("retourne null si plusieurs modèles", () => {
    expect(
      resolveArbitrageFicheTemplateForGeneration([
        template("a"),
        template("b", { isDefault: true }),
      ])
    ).toBeNull();
  });
});
