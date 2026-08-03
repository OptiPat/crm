import { describe, expect, it } from "vitest";
import { fundPerfSignTextClass } from "./fund-watchlist-display";

describe("fundPerfSignTextClass", () => {
  it("retourne muted pour null ou non fini", () => {
    expect(fundPerfSignTextClass(null)).toContain("text-muted-foreground");
    expect(fundPerfSignTextClass(undefined)).toContain("text-muted-foreground");
    expect(fundPerfSignTextClass(Number.NaN)).toContain("text-muted-foreground");
  });

  it("retourne vert pour une perf positive", () => {
    expect(fundPerfSignTextClass(2.3)).toContain("text-emerald");
  });

  it("retourne rouge pour une perf négative", () => {
    expect(fundPerfSignTextClass(-1.1)).toContain("text-rose");
  });

  it("retourne neutre pour zéro", () => {
    expect(fundPerfSignTextClass(0)).toContain("text-muted-foreground");
  });
});
