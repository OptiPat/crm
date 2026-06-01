import { invoke } from "@tauri-apps/api/core";

export interface StelliumExceltisSignal {
  gmail_message_id: string;
  subject: string;
  millesime_label: string;
  etiquette_nom: string;
  etiquette_id: number | null;
  contact_count: number;
  received_at: number;
  /** Date du mail « à partir du … » : début du désinvestissement, action possible ensuite. */
  operation_from_label?: string | null;
}

export interface StelliumExceltisScanResult {
  scanned: number;
  new_signals: number;
  signals: StelliumExceltisSignal[];
}

/** Compat invoke Tauri (snake_case) et anciennes réponses camelCase. */
function normalizeStelliumSignal(raw: StelliumExceltisSignal & Record<string, unknown>): StelliumExceltisSignal {
  const gmailMessageId = raw.gmail_message_id ?? raw.gmailMessageId;
  return {
    gmail_message_id: typeof gmailMessageId === "string" ? gmailMessageId : "",
    subject: raw.subject ?? "",
    millesime_label: String(raw.millesime_label ?? raw.millesimeLabel ?? ""),
    etiquette_nom: String(raw.etiquette_nom ?? raw.etiquetteNom ?? ""),
    etiquette_id: (raw.etiquette_id ?? raw.etiquetteId ?? null) as number | null,
    contact_count: Number(raw.contact_count ?? raw.contactCount ?? 0),
    received_at: Number(raw.received_at ?? raw.receivedAt ?? 0),
    operation_from_label:
      (raw.operation_from_label ?? raw.operationFromLabel ?? null) as string | null | undefined,
  };
}

function normalizeScanResult(raw: StelliumExceltisScanResult & Record<string, unknown>): StelliumExceltisScanResult {
  const signals = (raw.signals ?? []) as Array<StelliumExceltisSignal & Record<string, unknown>>;
  return {
    scanned: Number(raw.scanned ?? 0),
    new_signals: Number(raw.new_signals ?? raw.newSignals ?? 0),
    signals: signals.map(normalizeStelliumSignal),
  };
}

export const STELLIUM_EXCELTIS_CHANGED_EVENT = "stellium-exceltis-changed";

/** @deprecated Utiliser `STELLIUM_EXCELTIS_CHANGED_EVENT` */
export const STELLIUM_EXCELITIS_CHANGED_EVENT = STELLIUM_EXCELTIS_CHANGED_EVENT;

export function notifyStelliumExceltisChanged(): void {
  window.dispatchEvent(new CustomEvent(STELLIUM_EXCELTIS_CHANGED_EVENT));
}

export async function scanStelliumExceltisEmails(): Promise<StelliumExceltisScanResult> {
  const raw = await invoke<StelliumExceltisScanResult>("scan_stellium_exceltis_emails");
  return normalizeScanResult(raw as StelliumExceltisScanResult & Record<string, unknown>);
}

export async function getStelliumExceltisSignals(): Promise<StelliumExceltisSignal[]> {
  const raw = await invoke<StelliumExceltisSignal[]>("get_stellium_exceltis_signals");
  return raw.map((s) =>
    normalizeStelliumSignal(s as StelliumExceltisSignal & Record<string, unknown>)
  );
}

export async function dismissStelliumExceltisSignal(
  gmailMessageId: string
): Promise<void> {
  const id = gmailMessageId.trim();
  if (!id) {
    throw new Error("Identifiant de message invalide");
  }
  return invoke<void>("dismiss_stellium_exceltis_signal", {
    gmailMessageId: id,
  });
}
