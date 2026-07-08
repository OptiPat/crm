import { describe, expect, it } from "vitest";
import {
  NOTES_COOLDOWN_MS,
  NOTES_INTERVAL_MS,
  RELATION_COOLDOWN_MS,
  RELATION_INTERVAL_MS,
  STELLIUM_COOLDOWN_MS,
  STELLIUM_INTERVAL_MS,
} from "@/hooks/useBackgroundSync";

describe("useBackgroundSync timing", () => {
  it("Stellium : intervalle et cooldown à 1 h", () => {
    const oneHour = 60 * 60_000;
    expect(STELLIUM_INTERVAL_MS).toBe(oneHour);
    expect(STELLIUM_COOLDOWN_MS).toBe(oneHour);
  });

  it("Relation : intervalle 3 min, cooldown focus 90 s", () => {
    expect(RELATION_INTERVAL_MS).toBe(3 * 60_000);
    expect(RELATION_COOLDOWN_MS).toBe(90_000);
  });

  it("Notes : intervalle 5 min, cooldown 4 min", () => {
    expect(NOTES_INTERVAL_MS).toBe(5 * 60_000);
    expect(NOTES_COOLDOWN_MS).toBe(4 * 60_000);
  });
});
