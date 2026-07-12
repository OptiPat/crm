import { invoke } from "@tauri-apps/api/core";

export type TrayDigestPipeRdvItem = {
  calendar_event_id: number;
  start_at: number;
  timeline_titre: string | null;
  contact_nom: string;
  contact_prenom: string;
};

export type TrayDigestSnapshot = {
  pipe_rdvs_within_2h: TrayDigestPipeRdvItem[];
  alertes_count: number;
  taches_urgent_count: number;
  emails_ready_count: number;
};

export async function getTrayDigestSnapshot(): Promise<TrayDigestSnapshot> {
  return invoke<TrayDigestSnapshot>("get_tray_digest_snapshot");
}
