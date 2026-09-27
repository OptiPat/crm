import { describe, expect, it } from "vitest";
import { teamSyncReportMessage } from "./team-sync-status";

const base = {
  pulled: 0,
  pushed: 0,
  conflicts: 0,
  pending: 0,
  deltaLinkUpdated: true,
};

describe("teamSyncReportMessage", () => {
  it("reste silencieux quand tout est synchronisé", () => {
    expect(teamSyncReportMessage(base)).toBeNull();
    expect(teamSyncReportMessage({ ...base, failed: 0, lastError: null })).toBeNull();
  });

  it("annonce les conflits en priorité", () => {
    expect(
      teamSyncReportMessage({ ...base, conflicts: 2, failed: 3, lastError: "x" })
    ).toBe("2 conflit(s) de synchronisation à résoudre.");
  });

  it("remonte un refus SharePoint avec son détail", () => {
    expect(
      teamSyncReportMessage({
        ...base,
        failed: 1,
        lastError: "SharePoint a refusé la création de contacts (HTTP 400 invalidRequest).",
      })
    ).toBe(
      "1 ligne(s) refusée(s) par SharePoint — nouvel essai au prochain cycle. SharePoint a refusé la création de contacts (HTTP 400 invalidRequest)."
    );
  });

  it("tolère un rapport d'ancienne version sans champ failed", () => {
    expect(teamSyncReportMessage({ ...base, pushed: 4 })).toBeNull();
  });
});
