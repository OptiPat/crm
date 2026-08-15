import { describe, expect, it } from "vitest";
import { formatRetryDelay, isTeamAccessDenied, isTeamAccessReconnectable, parseAuthCommandError } from "./tauri-auth";

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

  it("reconnaît un accès équipe révoqué", () => {
    expect(
      parseAuthCommandError({
        code: "team_access_revoked",
        message: "Accès équipe révoqué. Ce compte Microsoft n'est plus autorisé à ouvrir le CRM.",
      }),
    ).toMatchObject({
      code: "team_access_revoked",
    });
    expect(isTeamAccessDenied("team_access_revoked")).toBe(true);
    expect(isTeamAccessDenied("team_access_required")).toBe(true);
    expect(isTeamAccessDenied("invalid_password")).toBe(false);
    expect(isTeamAccessReconnectable("team_access_required")).toBe(true);
    expect(isTeamAccessReconnectable("team_access_revoked")).toBe(false);
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
