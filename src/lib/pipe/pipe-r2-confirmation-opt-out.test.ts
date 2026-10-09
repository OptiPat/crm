import { describe, expect, it } from "vitest";
import {
  affaireHasR2Rdv,
  offerSkipR2ConfirmationEmail,
} from "@/lib/pipe/pipe-r2-confirmation-opt-out";

describe("offerSkipR2ConfirmationEmail", () => {
  const r2 = { entry_type: "RDV", titre: "R2 Placement" };
  const r1 = { entry_type: "RDV", titre: "R1" };
  const cancelled = { entry_type: "NOTE", titre: null };

  it("propose la case seulement pour un R2 supplémentaire", () => {
    expect(offerSkipR2ConfirmationEmail([r1], "R2")).toBe(false);
    expect(offerSkipR2ConfirmationEmail([r2], "R1")).toBe(false);
    expect(offerSkipR2ConfirmationEmail([r2], "R2_IMMO")).toBe(true);
    expect(offerSkipR2ConfirmationEmail([r2], "R2")).toBe(true);
  });

  it("ignore une annulation (plus une entrée RDV)", () => {
    expect(affaireHasR2Rdv([cancelled])).toBe(false);
    expect(offerSkipR2ConfirmationEmail([cancelled], "R2_PLACEMENT")).toBe(false);
  });
});
