import { describe, expect, it } from "vitest";
import { normalizeStelliumText } from "./normalize";
import { extractExperienceLevel, parseStelliumQpi } from "./qpi-parser";
import qpiDupontFixture from "./fixtures/qpi-solo-dupont-2026.txt?raw";

describe("extractExperienceLevel", () => {
  it("extrait Expérimenté depuis la ligne Novice / Informé / Expérimenté", () => {
    const text = normalizeStelliumText(qpiDupontFixture);
    expect(extractExperienceLevel(text)).toBe("Expérimenté");
  });

  it("détecte Novice coché", () => {
    expect(extractExperienceLevel("Offensif  ✓  Novice  Informé  Expérimenté")).toBe(
      "Novice"
    );
  });

  it("détecte Informé coché", () => {
    expect(
      extractExperienceLevel("Offensif  Novice  ✓  Informé  Expérimenté")
    ).toBe("Informé");
  });

  it("est exposé par parseStelliumQpi", () => {
    const data = parseStelliumQpi(qpiDupontFixture);
    expect(data.experienceInvestissement).toBe("Expérimenté");
  });
});
