import { describe, expect, it } from "vitest";
import {
  filterOtherPresence,
  formatPresenceBanner,
  mergeLockRenewEtag,
  shouldBlockEdit,
  TEAM_PRESENCE_HEARTBEAT_MS,
  TEAM_PRESENCE_POLL_MS,
} from "@/lib/team/team-collaboration-logic";

describe("team-collaboration-logic", () => {
  it("expose les intervalles heartbeat/polling attendus", () => {
    expect(TEAM_PRESENCE_POLL_MS).toBe(10_000);
    expect(TEAM_PRESENCE_HEARTBEAT_MS).toBe(30_000);
  });

  it("filterOtherPresence exclut l'acteur courant", () => {
    const entries = [
      { actorId: "a@example.com", actorDisplayName: "Conseiller A" },
      { actorId: "b@example.com", actorDisplayName: "Secrétaire B" },
    ];
    expect(filterOtherPresence(entries, "A@Example.com")).toEqual([
      { actorId: "b@example.com", actorDisplayName: "Secrétaire B" },
    ]);
  });

  it("formatPresenceBanner résume les autres lecteurs", () => {
    const banner = formatPresenceBanner([
      { actorId: "a@example.com", actorDisplayName: "Conseiller A" },
    ]);
    expect(banner).toContain("Conseiller A");
    expect(banner).toContain("consulte");
  });

  it("shouldBlockEdit est vrai si un verrou tiers est actif", () => {
    expect(shouldBlockEdit("other@example.com")).toBe(true);
    expect(shouldBlockEdit(null)).toBe(false);
  });

  it("mergeLockRenewEtag préfère l'ETag renvoyé par le renouvellement", () => {
    expect(mergeLockRenewEtag("\"1\"", "\"2\"")).toBe("\"2\"");
    expect(mergeLockRenewEtag("\"1\"", null)).toBe("\"1\"");
  });
});
