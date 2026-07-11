import { describe, expect, it } from "vitest";
import { defaultRdvVisioFromCgp } from "@/lib/calendar/rdv-visio";

describe("defaultRdvVisioFromCgp", () => {
  it("préremplit le mode custom si un lien est configuré", () => {
    expect(
      defaultRdvVisioFromCgp({ default_visio_link: "https://zoom.us/j/123" })
    ).toEqual({ mode: "custom", customLink: "https://zoom.us/j/123" });
  });

  it("propose Google Meet si aucun lien Zoom/Teams", () => {
    expect(defaultRdvVisioFromCgp({})).toEqual({ mode: "google_meet", customLink: "" });
    expect(defaultRdvVisioFromCgp(null)).toEqual({ mode: "google_meet", customLink: "" });
  });
});
