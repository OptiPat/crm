import { describe, expect, it } from "vitest";
import { parsePassifsEcheanceAnnuelle } from "./passifs-charges";
import rioMartinezFixture from "./fixtures/rio-martinez-2026.txt?raw";
import noyezFixture from "./fixtures/rio-noyez-gentil-couple-2026.txt?raw";

describe("passifs-charges", () => {
  it("retourne 0 pour Martinez sans crédit passif", () => {
    expect(parsePassifsEcheanceAnnuelle(rioMartinezFixture)).toBe(0);
  });

  it("lit le sous-total crédits immobilier sur NOYEZ/GENTIL", () => {
    expect(parsePassifsEcheanceAnnuelle(noyezFixture)).toBe(30516);
  });
});
