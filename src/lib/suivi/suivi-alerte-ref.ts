import type { Alerte } from "@/lib/api/tauri-alertes";
import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";

/** Référence minimale pour actions email / API alertes. */
export function suiviAlerteToRef(alerte: AlerteWithContact): Alerte {
  const dateRaw = alerte.date_alerte;
  const date_alerte =
    typeof dateRaw === "string" ? parseInt(dateRaw, 10) || 0 : dateRaw;
  return {
    id: alerte.alerte_id,
    contact_id: alerte.contact_id,
    type_alerte: alerte.type_alerte,
    message: alerte.message,
    date_alerte,
    lue: false,
    traitee: false,
    created_at: 0,
  };
}
