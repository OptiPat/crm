import { describe, expect, it } from "vitest";
import {
  parseAutomationNotificationTarget,
  resolveRelationSyncNavTarget,
  resolveTrayDigestNavTarget,
  serializeAutomationNotificationTarget,
} from "@/lib/background/automation-notification-nav";
import type { TrayDigestLine } from "@/lib/background/tray-digest-notify";

describe("automation-notification-nav", () => {
  it("priorise RDV puis alertes dans le digest", () => {
    const lines: TrayDigestLine[] = [
      { kind: "alertes", text: "2 alertes" },
      { kind: "rdv", text: "RDV R1 avec DUPONT" },
    ];
    expect(resolveTrayDigestNavTarget(lines)).toEqual({ page: "agenda" });
    expect(
      resolveTrayDigestNavTarget([{ kind: "alertes", text: "1 alerte Suivi à traiter" }])
    ).toEqual({ page: "suivi", tab: "alertes" });
  });

  it("route sync relation vers agenda ou suivi", () => {
    expect(
      resolveRelationSyncNavTarget({
        mail_detected: 0,
        rdv_campaign_detected: 1,
        calendar_accepted: 0,
        calendar_declined: 0,
        calendar_cancelled: 0,
      })
    ).toEqual({ page: "agenda" });
    expect(
      resolveRelationSyncNavTarget({
        mail_detected: 2,
        rdv_campaign_detected: 0,
        calendar_accepted: 0,
        calendar_declined: 0,
        calendar_cancelled: 0,
      })
    ).toEqual({ page: "suivi", tab: "envois", envoisSubTab: "followup" });
  });

  it("roundtrip serialize/parse extra nav", () => {
    const target = { page: "taches" as const };
    const extra = { nav: serializeAutomationNotificationTarget(target) };
    expect(parseAutomationNotificationTarget(extra)).toEqual(target);
  });
});
