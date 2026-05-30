import { checkAndApplyAutoEtiquettes } from "@/lib/api/tauri-etiquettes";
import { notifyEtiquettesChanged } from "@/lib/etiquettes/etiquette-events";

/**
 * Recalcul complet des règles auto (import massif, bouton « Recalculer »).
 * Les sauvegardes contact / investissement / étiquette déclenchent un recalcul incrémental côté Rust.
 */
export async function runFullEtiquettesRecalc(): Promise<number> {
  const n = await checkAndApplyAutoEtiquettes();
  notifyEtiquettesChanged();
  return n;
}
