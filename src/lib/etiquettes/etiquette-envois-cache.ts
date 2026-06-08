import type { EmailConnectionStatus } from "@/lib/api/tauri-email-oauth";
import type { CgpConfig } from "@/lib/api/tauri-settings";
import type { EtiquetteEmailQueueItem } from "@/lib/api/tauri-etiquettes";

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

export type EnvoisTabInitialState = EnvoisQueueCache & {
  loading: boolean;
  hasCache: boolean;
};

const emptyLists = {
  ready: [] as EtiquetteEmailQueueItem[],
  scheduled: [] as EtiquetteEmailQueueItem[],
  incomplete: [] as EtiquetteEmailQueueItem[],
  cancelled: [] as EtiquetteEmailQueueItem[],
  sent: [] as EtiquetteEmailQueueItem[],
  followup: [] as EtiquetteEmailQueueItem[],
};

let cache: EnvoisQueueCache | null = null;

export function getEnvoisQueueCache(): EnvoisQueueCache | null {
  return cache;
}

export function setEnvoisQueueCache(next: EnvoisQueueCache): void {
  cache = next;
}

/** État initial onglet Envois — évite le flash « Chargement… » si cache présent. */
export function getEnvoisTabInitialState(): EnvoisTabInitialState {
  const cached = getEnvoisQueueCache();
  if (!cached) {
    return {
      ...emptyLists,
      cgpConfig: null,
      emailStatus: null,
      loading: true,
      hasCache: false,
    };
  }
  return {
    ...cached,
    loading: false,
    hasCache: true,
  };
}
