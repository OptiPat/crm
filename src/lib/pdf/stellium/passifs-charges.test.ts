import { describe, expect, it } from "vitest";
import { parsePassifsEcheanceAnnuelle } from "./passifs-charges";
import legrandFixture from "./fixtures/rio-solo-legrand-2026.txt?raw";
import durandMoreauFixture from "./fixtures/rio-couple-durand-moreau-2026.txt?raw";

describe("passifs-charges", () => {
  it("retourne 0 pour Legrand sans crédit passif", () => {
    expect(parsePassifsEcheanceAnnuelle(legrandFixture)).toBe(0);
  });

  it("lit le sous-total crédits immobilier sur DURAND/MOREAU", () => {
    expect(parsePassifsEcheanceAnnuelle(durandMoreauFixture)).toBe(30516);
  });
});
