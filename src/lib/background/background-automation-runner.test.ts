import { describe, expect, it } from "vitest";
import { mergeAutomationCycleOptionsForTests } from "./background-automation-runner";

describe("mergeAutomationCycleOptionsForTests", () => {
  it("ne fusionne jamais les surfaces tray et foreground", () => {
    expect(
      mergeAutomationCycleOptionsForTests(
        { surface: "tray" },
        { surface: "foreground", jobs: { relation: true } }
      )
    ).toBeNull();
  });

  it("conserve un cycle complet lors d'une fusion avec un cycle partiel", () => {
    expect(
      mergeAutomationCycleOptionsForTests(
        { surface: "tray" },
        {
          surface: "tray",
          jobs: { relation: true, stellium: false },
        }
      )
    ).toEqual({
      surface: "tray",
      force: undefined,
      jobs: undefined,
    });
  });

  it("réunit les jobs vrais de deux groupes partiels", () => {
    expect(
      mergeAutomationCycleOptionsForTests(
        {
          surface: "foreground",
          jobs: { relation: true, stellium: false },
        },
        {
          surface: "foreground",
          jobs: { relation: false, stellium: true },
        }
      )
    ).toEqual({
      surface: "foreground",
      force: undefined,
      jobs: { relation: true, stellium: true },
    });
  });
});
