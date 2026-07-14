import { describe, expect, it } from "vitest";
import {
  datetimeLocalToUnix,
  defaultTimelineEntryTitle,
  isPipeTimelineUserType,
  PIPE_TIMELINE_QUICK_ADD_TYPES,
  unixToDatetimeLocalInput,
} from "./pipe-timeline-types";

describe("pipe-timeline-types", () => {
  it("reconnait les types utilisateur", () => {
    expect(isPipeTimelineUserType("APPEL")).toBe(true);
    expect(isPipeTimelineUserType("CREATION")).toBe(false);
  });

  it("titres par défaut", () => {
    expect(defaultTimelineEntryTitle("RDV")).toBe("RDV");
  });

  it("convertit datetime local", () => {
    const ts = datetimeLocalToUnix("2026-07-11T10:30");
    expect(unixToDatetimeLocalInput(ts)).toBe("2026-07-11T10:30");
  });

  it("journal rapide affaire sans arbitrage ni réinvestissement", () => {
    expect(PIPE_TIMELINE_QUICK_ADD_TYPES).toEqual([
      "APPEL",
      "RDV",
      "NOTE",
      "PROPOSITION",
    ]);
  });
});
