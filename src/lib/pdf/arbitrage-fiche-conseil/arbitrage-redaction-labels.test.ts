import { describe, expect, it } from "vitest";
import {
  validateArbitrageRedactionInput,
  FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS,
} from "@/lib/pdf/arbitrage-fiche-conseil/arbitrage-redaction-labels";

describe("validateArbitrageRedactionInput", () => {
  it("exige le motif pour AV", () => {
    expect(
      validateArbitrageRedactionInput("AV", {
        motif: "",
        supportsDesinvestis: "",
        supportsInvestis: "",
        allocationOperation: "",
      })
    ).toBe(FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.motif);
  });

  it("exige allocation pour PER", () => {
    expect(
      validateArbitrageRedactionInput("PER", {
        motif: "",
        supportsDesinvestis: "",
        supportsInvestis: "",
        allocationOperation: "  ",
      })
    ).toBe(FICHE_CONSEIL_ARBITRAGE_REDACTION_LABELS.allocationOperation);
  });
});
