import { getAlertesNonTraitees } from "@/lib/api/tauri-alertes";
import {
  getEtiquetteEmailQueue,
  type EtiquetteEmailQueueStatus,
} from "@/lib/api/tauri-etiquettes";
import { getStelliumExceltisSignals } from "@/lib/api/tauri-stellium-exceltis";
import type { SuiviMainTab } from "@/lib/navigation/suivi-navigation";

export type NotificationSeverity = "info" | "warning" | "urgent";

export type AppNotificationKind =
  | "emails_ready"
  | "emails_followup"
  | "emails_incomplete"
  | "emails_sent"
  | "alertes_suivi"
  | "exceltis_stellium";

export type AppNotificationItem = {
  id: AppNotificationKind | `exceltis_stellium:${string}`;
  label: string;
  count: number;
  severity: NotificationSeverity;
  suiviTab: SuiviMainTab;
  envoisSubTab?: EtiquetteEmailQueueStatus;
  /** Si une seule action : focus contact dans Suivi (alerte ou file email). */
  focusContactId?: number;
  /** Onglet Étiquettes : présélectionner cette étiquette (signal Stellium). */
  focusEtiquetteId?: number;
  /** Pour masquer un signal Stellium après traitement. */
  stelliumMessageId?: string;
};

export type AppNotificationsSummary = {
  items: AppNotificationItem[];
  totalCount: number;
};

export async function fetchAppNotificationsSummary(): Promise<AppNotificationsSummary> {
  const [alertes, ready, followup, incomplete, sent, stelliumSignals] =
    await Promise.all([
      getAlertesNonTraitees(),
      getEtiquetteEmailQueue("ready"),
      getEtiquetteEmailQueue("followup"),
      getEtiquetteEmailQueue("incomplete"),
      getEtiquetteEmailQueue("sent"),
      getStelliumExceltisSignals().catch(() => []),
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
      focusContactId: ready.length === 1 ? ready[0].contact_id : undefined,
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
      focusContactId: followup.length === 1 ? followup[0].contact_id : undefined,
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
      focusContactId: incomplete.length === 1 ? incomplete[0].contact_id : undefined,
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
      focusContactId: sent.length === 1 ? sent[0].contact_id : undefined,
    });
  }

  if (alertes.length > 0) {
    items.push({
      id: "alertes_suivi",
      label: "Alerte de suivi",
      count: alertes.length,
      severity: "warning",
      suiviTab: "alertes",
      focusContactId: alertes.length === 1 ? alertes[0].contact_id : undefined,
    });
  }

  for (const sig of stelliumSignals) {
    const clients = sig.contact_count;
    const disinvestFrom = sig.operation_from_label?.trim();
    const disinvestSuffix = disinvestFrom
      ? ` — fond désinvesti à partir du ${disinvestFrom}`
      : "";
    items.push({
      id: `exceltis_stellium:${sig.gmail_message_id}`,
      label: `Exceltis remboursé — ${sig.millesime_label}${disinvestSuffix}`,
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
