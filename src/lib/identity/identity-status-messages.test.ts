import { describe, expect, it } from "vitest";
import { ANONYMOUS_CNI_BIRTH_FR } from "@/lib/identity/fixtures/anonymous-cni-mrz";
import { resolveIdentityUserMessage } from "@/lib/identity/identity-status-messages";

describe("identity-status-messages", () => {
  it("passeport MRZ vérifiée", () => {
    const msg = resolveIdentityUserMessage({
      mrzVerified: true,
      mrz: undefined,
      dateNaissanceFr: ANONYMOUS_CNI_BIRTH_FR,
      lieuNaissance: undefined,
      layout: "passport",
      documentKind: "passport",
    });
    expect(msg).toContain("Passeport");
    expect(msg).toContain("MRZ");
  });

  it("CNI verso manquant", () => {
    const msg = resolveIdentityUserMessage({
      mrzVerified: false,
      mrz: undefined,
      dateNaissanceFr: undefined,
      lieuNaissance: undefined,
      userMessage: "import_recto_verso",
      layout: "two_pages",
      documentKind: "cni",
    });
    expect(msg).toContain("Verso");
  });
});
