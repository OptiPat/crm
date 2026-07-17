import { describe, expect, it } from "vitest";
import { formatRetryDelay, parseAuthCommandError } from "./tauri-auth";

describe("parseAuthCommandError", () => {
  it("conserve une erreur structurée Tauri", () => {
    expect(
      parseAuthCommandError({
        code: "rate_limited",
        message: "Patientez",
        retryAfterSeconds: 60,
      }),
    ).toEqual({
      code: "rate_limited",
      message: "Patientez",
      retryAfterSeconds: 60,
    });
  });

  it("accepte aussi une erreur sérialisée", () => {
    expect(
      parseAuthCommandError(
        JSON.stringify({
          code: "system_auth_unavailable",
          message: "Indisponible",
        }),
      ),
    ).toMatchObject({
      code: "system_auth_unavailable",
      message: "Indisponible",
    });
  });

  it("préserve le message d'une Error JavaScript", () => {
    expect(parseAuthCommandError(new Error("Échec natif"))).toEqual({
      code: "unknown",
      message: "Échec natif",
    });
  });
});

describe("formatRetryDelay", () => {
  it.each([
    [1, "1 seconde"],
    [45, "45 secondes"],
    [60, "1 minute"],
    [121, "3 minutes"],
    [3600, "1 heure"],
  ])("formate %i secondes", (seconds, expected) => {
    expect(formatRetryDelay(seconds)).toBe(expected);
  });
});
