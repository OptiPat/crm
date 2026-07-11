import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { formatPipeRdvCalendarContactLabel } from "@/lib/pipe/pipe-rdv-google-calendar";

export function buildPipeRdvCalendarContext(
  pipe: Pick<
    PipeRecord,
    "contact_id" | "contact_prenom" | "contact_nom"
  >
) {
  if (pipe.contact_id <= 0) return undefined;
  return {
    contactId: pipe.contact_id,
    contactLabel: formatPipeRdvCalendarContactLabel(pipe),
  };
}
