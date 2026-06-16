import type { Contact } from "@/lib/api/tauri-contacts";
import { createFoyer } from "@/lib/api/tauri-foyers";
import { buildFoyerNomFromMembers, linkContactToFoyer } from "@/lib/foyers/foyer-utils";

export async function ensureDeclarantFoyer(
  contact: Contact,
  options: {
    explicitFoyerId?: number;
    hasEnfants: boolean;
    isCouple?: boolean;
    /** Crée un foyer célibataire si fiscalité RIO à appliquer sans foyer existant. */
    hasFiscalData?: boolean;
  }
): Promise<{ contact: Contact; foyerId: number }> {
  if (options.explicitFoyerId) {
    if (Number(contact.foyer_id) === Number(options.explicitFoyerId)) {
      return { contact, foyerId: options.explicitFoyerId };
    }
    const role = contact.role_foyer ?? "DECLARANT_1";
    const linked = await linkContactToFoyer(contact, options.explicitFoyerId, role);
    return { contact: linked, foyerId: options.explicitFoyerId };
  }

  if (contact.foyer_id) {
    return { contact, foyerId: contact.foyer_id };
  }

  if (!options.hasEnfants && !options.isCouple && !options.hasFiscalData) {
    throw new Error("FOYER_NOT_REQUIRED");
  }

  const typeFoyer = options.isCouple
    ? "COUPLE"
    : options.hasEnfants
      ? "CELIBATAIRE"
      : "CELIBATAIRE";

  const foyer = await createFoyer({
    nom: buildFoyerNomFromMembers([contact]),
    type_foyer: typeFoyer,
  });

  const linked = await linkContactToFoyer(contact, foyer.id, "DECLARANT_1");
  return { contact: linked, foyerId: foyer.id };
}
