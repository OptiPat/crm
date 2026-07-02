import type { Contact } from "@/lib/api/tauri-contacts";

/** Contacts éligibles à un tag groupé (pas déjà porteurs de l'étiquette). */
export function filterContactsForBulkAssign(
  contacts: Contact[],
  alreadyTaggedIds: ReadonlySet<number>
): Contact[] {
  return contacts.filter((c) => c.id != null && !alreadyTaggedIds.has(c.id));
}

export function bulkAssignResultMessage(assigned: number, skipped: number): string {
  if (assigned === 0 && skipped > 0) {
    return `${skipped} contact${skipped > 1 ? "s" : ""} avait déjà l'étiquette.`;
  }
  if (skipped > 0) {
    return `${assigned} contact${assigned > 1 ? "s" : ""} tagué${assigned > 1 ? "s" : ""} · ${skipped} déjà tagué${skipped > 1 ? "s" : ""}.`;
  }
  return `${assigned} contact${assigned > 1 ? "s" : ""} tagué${assigned > 1 ? "s" : ""}.`;
}
