import { getContactById } from "@/lib/api/tauri-contacts";
import type { PipeRecord } from "@/lib/api/tauri-pipe";
import { formatPipeRdvCalendarContactLabel } from "@/lib/pipe/pipe-rdv-google-calendar";
import { toast } from "sonner";

export function buildPipeRdvCalendarContext(
  pipe: Pick<
    PipeRecord,
    | "contact_id"
    | "contact_prenom"
    | "contact_nom"
    | "secondary_contact_id"
    | "secondary_contact_prenom"
    | "secondary_contact_nom"
  >
) {
  if (pipe.contact_id <= 0) return undefined;
  const additionalAttendeeContactIds =
    pipe.secondary_contact_id != null && pipe.secondary_contact_id > 0
      ? [pipe.secondary_contact_id]
      : [];
  return {
    contactId: pipe.contact_id,
    contactLabel: formatPipeRdvCalendarContactLabel(pipe),
    additionalAttendeeContactIds,
  };
}

export async function warnPipeRdvMissingAttendeeEmails(
  pipe: Pick<PipeRecord, "contact_id" | "secondary_contact_id">
): Promise<void> {
  const ids = [pipe.contact_id, pipe.secondary_contact_id].filter(
    (id): id is number => id != null && id > 0
  );
  if (ids.length <= 1) return;

  const contacts = await Promise.all(
    ids.map((id) => getContactById(id).catch(() => null))
  );
  const missing = contacts.filter((c) => !c?.email?.trim().includes("@"));
  if (missing.length > 0) {
    toast.warning(
      "Certains participants n'ont pas d'email valide : ils ne recevront pas l'invitation Google."
    );
  }
}
