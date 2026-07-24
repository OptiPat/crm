import { describe, expect, it } from "vitest";
import {
  capabilitiesForRole,
  DEFAULT_WORKSPACE_CONFIG,
  effectiveTeamRole,
  isTeamConfigured,
  resolveTeamCapabilities,
  type WorkspaceConfig,
} from "./team-capabilities";

describe("team-capabilities", () => {
  it("sans config conserve le mode conseiller individuel", () => {
    expect(resolveTeamCapabilities(null)).toEqual({
      canExport: true,
      canManageMembers: true,
      canUsePersonalMailbox: true,
    });
    expect(resolveTeamCapabilities(undefined)).toEqual(
      resolveTeamCapabilities(null)
    );
  });

  it("mode local conserve les droits conseiller", () => {
    expect(resolveTeamCapabilities(DEFAULT_WORKSPACE_CONFIG)).toEqual(
      capabilitiesForRole("advisor")
    );
    expect(isTeamConfigured(DEFAULT_WORKSPACE_CONFIG)).toBe(false);
  });

  it("secrétaire équipe interdit export et gestion", () => {
    const config: WorkspaceConfig = {
      mode: "team_sharepoint",
      role: "secretary",
      siteHostname: "contoso.sharepoint.com",
      sitePath: "/sites/crm",
    };
    expect(effectiveTeamRole(config)).toBe("secretary");
    expect(resolveTeamCapabilities(config)).toEqual({
      canExport: false,
      canManageMembers: false,
      canUsePersonalMailbox: false,
    });
    expect(isTeamConfigured(config)).toBe(true);
  });

  it("conseiller équipe conserve tous les droits", () => {
    const config: WorkspaceConfig = {
      mode: "team_sharepoint",
      role: "advisor",
      siteHostname: "contoso.sharepoint.com",
      sitePath: "/sites/crm",
    };
    expect(resolveTeamCapabilities(config)).toEqual(capabilitiesForRole("advisor"));
  });
});
