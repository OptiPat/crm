import type { EtiquetteEmailQueueStatus } from "@/lib/api/tauri-etiquettes";
import { dispatchAppNavigation, navigateAppPage } from "@/lib/navigation/app-navigation";
import type { SuiviMainTab } from "@/lib/navigation/suivi-navigation";
import { navigateToTaches } from "@/lib/navigation/taches-navigation";
import type { TrayDigestLine } from "@/lib/background/tray-digest-notify";

export const AUTOMATION_NOTIFICATION_ACTION_TYPE = "crm-automation";

export type AutomationNotificationTarget =
  | { page: "dashboard" }
  | { page: "agenda" }
  | { page: "pipe" }
  | { page: "contacts" }
  | { page: "taches" }
  | {
      page: "suivi";
      tab: SuiviMainTab;
      envoisSubTab?: EtiquetteEmailQueueStatus;
    };

export function serializeAutomationNotificationTarget(
  target: AutomationNotificationTarget
): string {
  return JSON.stringify(target);
}

export function parseAutomationNotificationTarget(
  extra: Record<string, unknown> | undefined
): AutomationNotificationTarget {
  if (!extra) return { page: "dashboard" };
  const raw = extra["nav"];
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as AutomationNotificationTarget;
      if (parsed && typeof parsed === "object" && "page" in parsed) {
        return parsed;
      }
    } catch {
      /* ignore */
    }
  }
  if (typeof raw === "object" && raw !== null && "page" in raw) {
    return raw as AutomationNotificationTarget;
  }
  return { page: "dashboard" };
}

const DIGEST_NAV_PRIORITY: TrayDigestLine["kind"][] = [
  "rdv",
  "alertes",
  "placement",
  "taches",
  "emails",
];

export function resolveTrayDigestNavTarget(
  lines: TrayDigestLine[]
): AutomationNotificationTarget {
  for (const kind of DIGEST_NAV_PRIORITY) {
    if (!lines.some((l) => l.kind === kind)) continue;
    switch (kind) {
      case "rdv":
        return { page: "agenda" };
      case "alertes":
        return { page: "suivi", tab: "alertes" };
      case "placement":
        return { page: "suivi", tab: "alertes" };
      case "taches":
        return { page: "taches" };
      case "emails":
        return { page: "suivi", tab: "envois", envoisSubTab: "ready" };
    }
  }
  return { page: "dashboard" };
}

export type RelationSyncChangeFlags = {
  mail_detected: number;
  rdv_campaign_detected: number;
  calendar_accepted: number;
  calendar_declined: number;
  calendar_cancelled: number;
};

export function resolveRelationSyncNavTarget(
  flags: RelationSyncChangeFlags
): AutomationNotificationTarget {
  if (
    flags.rdv_campaign_detected > 0 ||
    flags.calendar_accepted > 0 ||
    flags.calendar_declined > 0 ||
    flags.calendar_cancelled > 0
  ) {
    return { page: "agenda" };
  }
  if (flags.mail_detected > 0) {
    return { page: "suivi", tab: "envois", envoisSubTab: "followup" };
  }
  return { page: "suivi", tab: "alertes" };
}

export function applyAutomationNotificationTarget(
  target: AutomationNotificationTarget,
  setCurrentPage: (page: string) => void
): void {
  switch (target.page) {
    case "dashboard":
      setCurrentPage("dashboard");
      dispatchAppNavigation({ type: "page", page: "dashboard" });
      break;
    case "agenda":
      setCurrentPage("agenda");
      dispatchAppNavigation({ type: "page", page: "agenda" });
      break;
    case "pipe":
      setCurrentPage("pipe");
      dispatchAppNavigation({ type: "page", page: "pipe" });
      break;
    case "contacts":
      setCurrentPage("contacts");
      dispatchAppNavigation({ type: "page", page: "contacts" });
      break;
    case "taches":
      navigateToTaches(setCurrentPage, "urgent");
      break;
    case "suivi":
      navigateAppPage("", setCurrentPage, "suivi", {
        type: "suivi",
        tab: target.tab,
        envoisSubTab: target.envoisSubTab,
      });
      break;
  }
}
