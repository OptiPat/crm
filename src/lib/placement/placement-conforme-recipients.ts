import type { PipeRecord } from "@/lib/api/tauri-pipe";

/**
 * Destinataires du mail client Box Placement conforme.
 * - Pipe couple (secondary_contact_id) → toujours les deux, quel que soit le nom dans le mail Stellium
 *   ou le contact_id de l'opération (1 ou 2 investisseurs côté Stellium).
 * - Pipe solo / sans pipe → contact de l'opération uniquement.
 */
export function resolvePlacementConformeRecipientContactIds(
  operationContactId: number,
  pipe: Pick<PipeRecord, "contact_id" | "secondary_contact_id"> | null | undefined
): number[] {
  if (
    pipe?.secondary_contact_id != null &&
    pipe.secondary_contact_id > 0 &&
    pipe.contact_id > 0
  ) {
    return [...new Set([pipe.contact_id, pipe.secondary_contact_id])];
  }

  if (pipe && pipe.contact_id > 0) {
    return [pipe.contact_id];
  }

  return operationContactId > 0 ? [operationContactId] : [];
}
