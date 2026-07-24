import { describe, expect, it } from "vitest";
import {
  buildSendFromOptions,
  defaultSendFromEmail,
  shouldShowSendFromSelector,
} from "./send-from-options";
import type { WorkspaceConfig } from "./team-capabilities";

const teamAdvisor: WorkspaceConfig = {
  mode: "team_sharepoint",
  role: "advisor",
  siteHostname: "contoso.sharepoint.com",
  sitePath: "/sites/crm",
  officeMailboxEmail: "cabinet@example.com",
};

const teamSecretary: WorkspaceConfig = {
  ...teamAdvisor,
  role: "secretary",
};

describe("send-from-options", () => {
  it("mode local : aucune option", () => {
    expect(buildSendFromOptions({ mode: "local" }, "cgp@example.com")).toEqual([]);
    expect(shouldShowSendFromSelector({ mode: "local" }, "cgp@example.com")).toBe(false);
  });

  it("secrétaire : uniquement boîte cabinet si configurée", () => {
    expect(buildSendFromOptions(teamSecretary, "cgp@example.com")).toEqual([
      { value: "cabinet@example.com", label: "Cabinet (cabinet@example.com)" },
    ]);
    expect(defaultSendFromEmail(teamSecretary, "cgp@example.com")).toBe("cabinet@example.com");
    expect(shouldShowSendFromSelector(teamSecretary, "cgp@example.com")).toBe(false);
  });

  it("secrétaire sans boîte cabinet : pas de sélecteur", () => {
    const config = { ...teamSecretary, officeMailboxEmail: null };
    expect(buildSendFromOptions(config, null)).toEqual([]);
    expect(shouldShowSendFromSelector(config, null)).toBe(false);
  });

  it("conseiller : personnel + cabinet affiche le sélecteur", () => {
    expect(buildSendFromOptions(teamAdvisor, "CGP@Example.com")).toEqual([
      { value: "cgp@example.com", label: "Personnel (cgp@example.com)" },
      { value: "cabinet@example.com", label: "Cabinet (cabinet@example.com)" },
    ]);
    expect(defaultSendFromEmail(teamAdvisor, "cgp@example.com")).toBe("cgp@example.com");
    expect(shouldShowSendFromSelector(teamAdvisor, "cgp@example.com")).toBe(true);
  });

  it("conseiller sans boîte cabinet : pas de sélecteur", () => {
    const config = { ...teamAdvisor, officeMailboxEmail: null };
    expect(buildSendFromOptions(config, "cgp@example.com")).toEqual([
      { value: "cgp@example.com", label: "Personnel (cgp@example.com)" },
    ]);
    expect(shouldShowSendFromSelector(config, "cgp@example.com")).toBe(false);
  });
});
