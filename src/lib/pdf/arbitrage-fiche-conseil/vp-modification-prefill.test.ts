import { describe, expect, it, vi } from "vitest";
import { loadVpModificationMontantEurosPrefill } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-prefill";

const getInvestissementsByContact = vi.fn();
const buildPartenaireNomMap = vi.fn();

vi.mock("@/lib/api/tauri-investissements", () => ({
  getInvestissementsByContact: (...args: unknown[]) => getInvestissementsByContact(...args),
}));

vi.mock("@/lib/pdf/arbitrage-fiche-conseil/fiche-conseil-partenaires", () => ({
  buildPartenaireNomMap: (...args: unknown[]) => buildPartenaireNomMap(...args),
}));

describe("loadVpModificationMontantEurosPrefill", () => {
  it("retourne vide sans contact ou produit", async () => {
    await expect(loadVpModificationMontantEurosPrefill(0, "Produit")).resolves.toBe("");
    await expect(loadVpModificationMontantEurosPrefill(1, "")).resolves.toBe("");
  });
});
