import type { StelliumExceltisSignal } from "@/lib/api/tauri-stellium-exceltis";
import { stelliumExceltisHeadline } from "@/lib/etiquettes/stellium-signal-ui";
import type { EtiquetteEmailQueueStatus } from "@/lib/api/tauri-etiquettes";
import type { SuiviMainTab } from "@/lib/navigation/suivi-navigation";
import { invoke } from "@tauri-apps/api/core";

export type NotificationSeverity = "info" | "warning" | "urgent";

export type AppNotificationKind =
  | "emails_ready"
  | "emails_followup"
  | "emails_incomplete"
  | "emails_sent"
  | "alertes_suivi"
  | "taches_urgent"
  | "placement_non_conforme"
  | "exceltis_stellium"
  | "compta_month_end";

export type AppNotificationItem = {
  id: AppNotificationKind | `exceltis_stellium:${string}`;
  label: string;
  count: number;
  severity: NotificationSeverity;
  /** Cible Suivi (défaut historique). */
  suiviTab?: SuiviMainTab;
  envoisSubTab?: EtiquetteEmailQueueStatus;
  focusContactId?: number;
  focusEtiquetteId?: number;
  stelliumMessageId?: string;
  /** Cible page Tâches. */
  targetPage?: "taches" | "comptabilite";
  tachesEcheanceFilter?: "urgent";
};

export type AppNotificationsSummary = {
  items: AppNotificationItem[];
  totalCount: number;
};

export type NotificationQueueBucketDto = {
  count: number;
  focus_contact_id?: number | null;
};

export type AppNotificationsSummaryDto = {
  ready: NotificationQueueBucketDto;
  followup: NotificationQueueBucketDto;
  incomplete: NotificationQueueBucketDto;
  sent: NotificationQueueBucketDto;
  alertes: NotificationQueueBucketDto;
  taches_urgent: NotificationQueueBucketDto;
  placement_non_conforme: NotificationQueueBucketDto;
  stellium_signals: StelliumExceltisSignal[];
};

export function buildAppNotificationsSummary(
  dto: AppNotificationsSummaryDto
): AppNotificationsSummary {
  const items: AppNotificationItem[] = [];

  const pushQueue = (
    id: AppNotificationKind,
    label: string,
    severity: NotificationSeverity,
    envoisSubTab: EtiquetteEmailQueueStatus,
    bucket: NotificationQueueBucketDto
  ) => {
    if (bucket.count <= 0) return;
    items.push({
      id,
      label,
      count: bucket.count,
      severity,
      suiviTab: "envois",
      envoisSubTab,
      focusContactId:
        bucket.count === 1 && bucket.focus_contact_id != null
          ? bucket.focus_contact_id
          : undefined,
    });
  };

  pushQueue("emails_ready", "Email à envoyer", "urgent", "ready", dto.ready);
  pushQueue("emails_followup", "Relance sans réponse", "warning", "followup", dto.followup);
  pushQueue("emails_incomplete", "Envoi à compléter", "warning", "incomplete", dto.incomplete);
  pushQueue("emails_sent", "En attente de réponse client", "info", "sent", dto.sent);

  if (dto.alertes.count > 0) {
    items.push({
      id: "alertes_suivi",
      label: "Alerte de suivi",
      count: dto.alertes.count,
      severity: "warning",
      suiviTab: "alertes",
      focusContactId:
        dto.alertes.count === 1 && dto.alertes.focus_contact_id != null
          ? dto.alertes.focus_contact_id
          : undefined,
    });
  }

  if (dto.taches_urgent.count > 0) {
    items.push({
      id: "taches_urgent",
      label: "Aujourd'hui / en retard",
      count: dto.taches_urgent.count,
      severity: "urgent",
      targetPage: "taches",
      tachesEcheanceFilter: "urgent",
      focusContactId:
        dto.taches_urgent.count === 1 && dto.taches_urgent.focus_contact_id != null
          ? dto.taches_urgent.focus_contact_id
          : undefined,
    });
  }

  if (dto.placement_non_conforme.count > 0) {
    items.push({
      id: "placement_non_conforme",
      label:
        dto.placement_non_conforme.count === 1
          ? "Opération partenaire non conforme"
          : "Opérations partenaire non conformes",
      count: dto.placement_non_conforme.count,
      severity: "urgent",
      suiviTab: "alertes",
      focusContactId:
        dto.placement_non_conforme.count === 1 &&
        dto.placement_non_conforme.focus_contact_id != null
          ? dto.placement_non_conforme.focus_contact_id
          : undefined,
    });
  }

  for (const sig of dto.stellium_signals) {
    const clients = sig.contact_count;
    const disinvestFrom = sig.operation_from_label?.trim();
    const disinvestSuffix = disinvestFrom
      ? ` — fond désinvesti à partir du ${disinvestFrom}`
      : "";
    items.push({
      id: `exceltis_stellium:${sig.gmail_message_id}`,
      label: `${stelliumExceltisHeadline(sig.subject, sig.millesime_label, sig.etiquette_nom)}${disinvestSuffix}`,
      count: clients > 0 ? clients : 1,
      severity: clients > 0 ? "urgent" : "warning",
      suiviTab: "etiquettes",
      focusEtiquetteId: sig.etiquette_id ?? undefined,
      stelliumMessageId: sig.gmail_message_id,
    });
  }

  const totalCount = items.reduce((s, i) => s + i.count, 0);
  return { items, totalCount };
}

export async function fetchAppNotificationsSummary(): Promise<AppNotificationsSummary> {
  const dto = await invoke<AppNotificationsSummaryDto>("get_app_notifications_summary");
  return buildAppNotificationsSummary(dto);
}
