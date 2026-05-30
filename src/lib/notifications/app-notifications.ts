import { getAlertesNonTraitees } from "@/lib/api/tauri-alertes";
import {
  getEtiquetteEmailQueue,
  type EtiquetteEmailQueueStatus,
} from "@/lib/api/tauri-etiquettes";
import type { SuiviMainTab } from "@/lib/navigation/suivi-navigation";

export type NotificationSeverity = "info" | "warning" | "urgent";

export type AppNotificationKind =
  | "emails_ready"
  | "emails_followup"
  | "emails_incomplete"
  | "emails_sent"
  | "alertes_suivi";

export type AppNotificationItem = {
  id: AppNotificationKind;
  label: string;
  count: number;
  severity: NotificationSeverity;
  suiviTab: SuiviMainTab;
  envoisSubTab?: EtiquetteEmailQueueStatus;
};

export type AppNotificationsSummary = {
  items: AppNotificationItem[];
  totalCount: number;
};

export async function fetchAppNotificationsSummary(): Promise<AppNotificationsSummary> {
  const [alertes, ready, followup, incomplete, sent] = await Promise.all([
    getAlertesNonTraitees(),
    getEtiquetteEmailQueue("ready"),
    getEtiquetteEmailQueue("followup"),
    getEtiquetteEmailQueue("incomplete"),
    getEtiquetteEmailQueue("sent"),
  ]);

  const items: AppNotificationItem[] = [];

  if (ready.length > 0) {
    items.push({
      id: "emails_ready",
      label: "Email à envoyer",
      count: ready.length,
      severity: "urgent",
      suiviTab: "envois",
      envoisSubTab: "ready",
    });
  }

  if (followup.length > 0) {
    items.push({
      id: "emails_followup",
      label: "Relance sans réponse",
      count: followup.length,
      severity: "warning",
      suiviTab: "envois",
      envoisSubTab: "followup",
    });
  }

  if (incomplete.length > 0) {
    items.push({
      id: "emails_incomplete",
      label: "Envoi à compléter",
      count: incomplete.length,
      severity: "warning",
      suiviTab: "envois",
      envoisSubTab: "incomplete",
    });
  }

  if (sent.length > 0) {
    items.push({
      id: "emails_sent",
      label: "En attente de réponse client",
      count: sent.length,
      severity: "info",
      suiviTab: "envois",
      envoisSubTab: "sent",
    });
  }

  if (alertes.length > 0) {
    items.push({
      id: "alertes_suivi",
      label: "Alerte de suivi",
      count: alertes.length,
      severity: "warning",
      suiviTab: "alertes",
    });
  }

  const totalCount = items.reduce((s, i) => s + i.count, 0);
  return { items, totalCount };
}
