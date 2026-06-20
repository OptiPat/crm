import { describe, expect, it } from "vitest";
import {
  CURRENT_SCPI_DIGEST_VERSION,
  isScpiDigestStale,
  parseScpiDigestVersion,
} from "./scpi-digest-stale";

describe("scpi-digest-stale", () => {
  it("marque obsolète si digest_version absent ou inférieur", () => {
    expect(isScpiDigestStale(JSON.stringify({ bulletin_resume: "x" }))).toBe(true);
    expect(
      isScpiDigestStale(
        JSON.stringify({ digest_version: CURRENT_SCPI_DIGEST_VERSION - 1 })
      )
    ).toBe(true);
    expect(
      isScpiDigestStale(
        JSON.stringify({ digest_version: CURRENT_SCPI_DIGEST_VERSION })
      )
    ).toBe(false);
  });

  it("ignore campaign_variables vide", () => {
    expect(isScpiDigestStale(null)).toBe(false);
    expect(parseScpiDigestVersion("")).toBe(0);
  });
});
