import { describe, expect, it } from "vitest";
import { buildEmailCampaignRows } from "./email-campaigns-dashboard";

describe("buildEmailCampaignRows", () => {
  it("inclut SCPI et Stellium quand les deux ont une activité", () => {
    const rows = buildEmailCampaignRows(
      {
        lastPrepare: {
          periode: "T1 2026",
          batchKey: "t12026",
          preparedAt: 1_700_000_000,
          bulletinsCount: 3,
          contactsMatched: 2,
          contactsQueued: 2,
          contactsNoEmail: 0,
          contactsSkippedAlreadySent: 0,
          digestVersion: 1,
        },
        readyCount: 0,
        sentSincePrepare: 5,
        currentDigestVersion: 1,
      },
      {
        lastPrepare: {
          periode: "Juin 2026",
          batchKey: "juin2026",
          preparedAt: 1_700_000_100,
          contractCount: 4,
          contactsMatched: 3,
          contactsQueued: 2,
          contactsNoEmail: 0,
          contactsProxyToParent: 0,
          contactsSkippedAlreadySent: 0,
          digestVersion: 3,
        },
        readyCount: 2,
        sentSincePrepare: 0,
        currentDigestVersion: 3,
      }
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.kind).toBe("scpi");
    expect(rows[1]?.kind).toBe("stellium_perf");
    expect(rows[1]?.active).toBe(true);
  });

  it("retourne vide sans prepare ni file", () => {
    expect(buildEmailCampaignRows(null, null)).toEqual([]);
  });
});
