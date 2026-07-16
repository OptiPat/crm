import { describe, expect, it } from "vitest";
import {
  RELATION_COOLDOWN_MS,
  RELATION_INTERVAL_MS,
  STELLIUM_COOLDOWN_MS,
  STELLIUM_INTERVAL_MS,
  BIRTHDAY_COOLDOWN_MS,
  BIRTHDAY_INTERVAL_MS,
  WAKE_MIN_INTERVAL_MS,
  FOREGROUND_POLL_MS,
} from "@/hooks/useBackgroundSync";

describe("useBackgroundSync timing", () => {
  it("Stellium : intervalle par défaut 15 min, cooldown focus 90 s", () => {
    expect(STELLIUM_INTERVAL_MS).toBe(15 * 60_000);
    expect(STELLIUM_COOLDOWN_MS).toBe(90_000);
  });

  it("Relation : intervalle 15 min par défaut, cooldown focus 90 s", () => {
    expect(RELATION_INTERVAL_MS).toBe(15 * 60_000);
    expect(RELATION_COOLDOWN_MS).toBe(90_000);
  });

  it("Wake : debounce court, minimum 60 s entre cycles focus", () => {
    expect(WAKE_MIN_INTERVAL_MS).toBe(60_000);
  });

  it("Foreground : tick unique 60 s pour le prochain groupe dû", () => {
    expect(FOREGROUND_POLL_MS).toBe(60_000);
  });

  it("Anniversaires : intervalle et cooldown", () => {
    expect(BIRTHDAY_INTERVAL_MS).toBe(60 * 60_000);
    expect(BIRTHDAY_COOLDOWN_MS).toBe(30 * 60_000);
  });
});
