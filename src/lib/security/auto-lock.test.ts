import { describe, expect, it } from "vitest";
import { shouldAutoLock } from "./auto-lock";

describe("shouldAutoLock", () => {
  it("verrouille lorsque le délai est atteint, y compris après une veille", () => {
    expect(shouldAutoLock(15 * 60_000, 0, 15)).toBe(true);
    expect(shouldAutoLock(14 * 60_000, 0, 15)).toBe(false);
  });

  it("reste désactivé avec un délai nul ou invalide", () => {
    expect(shouldAutoLock(10_000_000, 0, 0)).toBe(false);
    expect(shouldAutoLock(10_000_000, 0, Number.NaN)).toBe(false);
  });
});
