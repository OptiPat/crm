import { describe, expect, it } from "vitest";
import { normalizeStelliumText } from "./normalize";
import { extractSensibiliteExtraFinanciere, parseStelliumQpi } from "./qpi-parser";
import qpiFixture from "./fixtures/qpi-plaza-2026.txt?raw";

describe("extractSensibiliteExtraFinanciere", () => {
  it("extrait la première phrase après le titre de section", () => {
    const text = normalizeStelliumText(qpiFixture);
    expect(extractSensibiliteExtraFinanciere(text)).toBe(
      "Vous ne souhaitez pas préciser vos préférences en matière de durabilité"
    );
  });

  it("ignore la mention introductive du paragraphe d'accroche", () => {
    const text = normalizeStelliumText(
      "Conformément aux exigences, votre sensibilité extra-financière sur des éléments de durabilité. " +
        "Sensibilité extra-financière  Vous souhaitez un minimum de 10 % d'investissements durables  La notion de sensibilité"
    );
    expect(extractSensibiliteExtraFinanciere(text)).toBe(
      "Vous souhaitez un minimum de 10 % d'investissements durables"
    );
  });

  it("est exposée par parseStelliumQpi", () => {
    const data = parseStelliumQpi(qpiFixture);
    expect(data.sensibiliteExtraFinanciere).toBe(
      "Vous ne souhaitez pas préciser vos préférences en matière de durabilité"
    );
  });
});
