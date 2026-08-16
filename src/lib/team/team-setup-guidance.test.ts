import { describe, expect, it } from "vitest";
import {
  assistantFicheCopyBlockedReason,
  teamJoinBlockedReason,
} from "@/lib/team/team-setup-guidance";

describe("team-setup-guidance", () => {
  it("refuse de copier la fiche sans ID site", () => {
    expect(assistantFicheCopyBlockedReason(undefined)).toMatch(/ID site/);
    expect(assistantFicheCopyBlockedReason("")).toMatch(/ID site/);
    expect(assistantFicheCopyBlockedReason("—")).toMatch(/ID site/);
    expect(assistantFicheCopyBlockedReason("contoso.sharepoint.com,guid,guid")).toBeNull();
  });

  it("explique pourquoi Rejoindre est gris", () => {
    expect(
      teamJoinBlockedReason({
        connected: false,
        teamConfigured: true,
        siteId: "site",
      }),
    ).toMatch(/Microsoft/);
    expect(
      teamJoinBlockedReason({
        connected: true,
        teamConfigured: false,
        siteId: "site",
      }),
    ).toMatch(/configuration/);
    expect(
      teamJoinBlockedReason({
        connected: true,
        teamConfigured: true,
        siteId: "",
      }),
    ).toMatch(/ID site/);
    expect(
      teamJoinBlockedReason({
        connected: true,
        teamConfigured: true,
        siteId: "site",
      }),
    ).toBeNull();
  });
});
