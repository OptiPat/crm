import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { formatPipeContactLabel } from "@/lib/pipe/pipe-types";

export function buildPipeRdvCalendarContext(
  pipe: Pick<
    PipeRecord,
    "contact_id" | "contact_prenom" | "contact_nom" | "titre"
  >
) {
  if (pipe.contact_id <= 0) return undefined;
  return {
    contactId: pipe.contact_id,
    contactLabel: formatPipeContactLabel(pipe),
    pipeTitre: pipe.titre,
  };
}
