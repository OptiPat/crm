import { describe, expect, it } from "vitest";
import { isFicheConseilActionsBusy } from "@/hooks/useArbitrageFicheConseil";

describe("isFicheConseilActionsBusy", () => {
  const idle = {
    busy: false,
    pendingPick: null,
    pendingContratPick: null,
    pendingRedaction: null,
  };

  it("idle sans envoi pipe", () => {
    expect(isFicheConseilActionsBusy(idle)).toBe(false);
  });

  it("busy pendant génération ou dialogue", () => {
    expect(isFicheConseilActionsBusy({ ...idle, busy: true })).toBe(true);
    expect(isFicheConseilActionsBusy({ ...idle, pendingPick: {} as never })).toBe(true);
    expect(isFicheConseilActionsBusy({ ...idle, pendingContratPick: {} as never })).toBe(true);
    expect(isFicheConseilActionsBusy({ ...idle, pendingRedaction: {} as never })).toBe(true);
  });

  it("busy pendant envoi pipe", () => {
    expect(isFicheConseilActionsBusy(idle, 42)).toBe(true);
  });
});
