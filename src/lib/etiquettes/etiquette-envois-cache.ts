import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";
import type { EmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import type { CgpConfig } from "@/lib/api/tauri-settings";

export type EnvoisQueueCache = {
  ready: EtiquetteEmailQueueItem[];
  scheduled: EtiquetteEmailQueueItem[];
  incomplete: EtiquetteEmailQueueItem[];
  cancelled: EtiquetteEmailQueueItem[];
  sent: EtiquetteEmailQueueItem[];
  followup: EtiquetteEmailQueueItem[];
  cgpConfig: CgpConfig | null;
  emailStatus: EmailConnectionStatus | null;
};

let cache: EnvoisQueueCache | null = null;

export function getEnvoisQueueCache(): EnvoisQueueCache | null {
  return cache;
}

export function setEnvoisQueueCache(next: EnvoisQueueCache): void {
  cache = next;
}
