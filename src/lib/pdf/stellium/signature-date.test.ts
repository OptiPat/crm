import { describe, expect, it } from "vitest";
import { normalizeStelliumText } from "./normalize";
import { extractStelliumSignatureDate } from "./signature-date";
import debbaghiFixture from "./fixtures/rio-debbaghi-couple-2026.txt?raw";
import martinezFixture from "./fixtures/rio-martinez-2026.txt?raw";
import qpiFixture from "./fixtures/qpi-plaza-2026.txt?raw";

describe("extractStelliumSignatureDate", () => {
  it("extrait la date RIO depuis le bloc signature (dernière page)", () => {
    const text = normalizeStelliumText(debbaghiFixture);
    expect(extractStelliumSignatureDate(text, "RIO")).toBe("15/06/2026");
  });

  it("extrait la date RIO solo Martinez", () => {
    const text = normalizeStelliumText(martinezFixture);
    expect(extractStelliumSignatureDate(text, "RIO")).toBe("15/06/2026");
  });

  it("extrait la date QPI depuis le bloc signature (dernière page)", () => {
    const text = normalizeStelliumText(qpiFixture);
    expect(extractStelliumSignatureDate(text, "QPI")).toBe("15/06/2026");
  });

  it("ignore un pied de page intermédiaire (2/7) au profit du 7/7", () => {
    const text = normalizeStelliumText(
      "Recueil d'informations - Client Test - 01/01/2020   1/3\n\n" +
        "Recueil d'informations - Client Test - 02/02/2020   2/3\n\n" +
        "Date et signature des investisseurs et du consultant\n" +
        "Recueil d'informations - Client Test - 16/06/2026   3/3"
    );
    expect(extractStelliumSignatureDate(text, "RIO")).toBe("16/06/2026");
  });
});
