import type { Contact, ContactFiscal } from "@/lib/api/tauri-contacts";
import { getContactsByFoyer, updateContactFiscal } from "@/lib/api/tauri-contacts";

/** Les 4 champs fiscaux partagés entre contact et foyer. */
export type FiscalFields = ContactFiscal;

/** Extrait les 4 champs fiscaux d'un foyer ou d'un contact (sans le reste). */
export function pickFiscal(
  source: Partial<FiscalFields> | null | undefined
): FiscalFields {
  return {
    tranche_imposition: source?.tranche_imposition,
    nombre_parts_fiscales: source?.nombre_parts_fiscales,
    revenu_fiscal_reference: source?.revenu_fiscal_reference,
    ir_net_a_payer: source?.ir_net_a_payer,
  };
}

/** true si au moins un champ fiscal est renseigné. */
export function hasAnyFiscal(fiscal: FiscalFields | null | undefined): boolean {
  if (!fiscal) return false;
  return (
    (fiscal.tranche_imposition?.trim()?.length ?? 0) > 0 ||
    fiscal.nombre_parts_fiscales != null ||
    fiscal.revenu_fiscal_reference != null ||
    fiscal.ir_net_a_payer != null
  );
}

function resolveFiscalField<T extends string | number | undefined>(
  foyerValue: T,
  contactValue: T
): T {
  if (typeof foyerValue === "string") {
    return (foyerValue.trim().length > 0 ? foyerValue : contactValue) as T;
  }
  return (foyerValue ?? contactValue) as T;
}

/**
 * Fiscalité à afficher pour un contact rattaché à un foyer : le foyer prime
 * champ par champ (source de vérité couple). Fallback contact si le foyer n'a
 * pas encore la valeur (existant non rétro-rempli).
 */
export function resolveContactFiscal(
  contact: Partial<FiscalFields> | null | undefined,
  foyer: Partial<FiscalFields> | null | undefined
): FiscalFields {
  const fromFoyer = pickFiscal(foyer);
  const fromContact = pickFiscal(contact);
  return {
    tranche_imposition: resolveFiscalField(
      fromFoyer.tranche_imposition,
      fromContact.tranche_imposition
    ),
    nombre_parts_fiscales: resolveFiscalField(
      fromFoyer.nombre_parts_fiscales,
      fromContact.nombre_parts_fiscales
    ),
    revenu_fiscal_reference: resolveFiscalField(
      fromFoyer.revenu_fiscal_reference,
      fromContact.revenu_fiscal_reference
    ),
    ir_net_a_payer: resolveFiscalField(
      fromFoyer.ir_net_a_payer,
      fromContact.ir_net_a_payer
    ),
  };
}

/**
 * Propage la fiscalité d'un foyer à toutes les fiches contacts de ses membres.
 * Appelé après une écriture sur le foyer (depuis la fiche foyer ou la fiche
 * d'un membre) pour garder contact ↔ foyer synchronisés.
 */
export async function propagateFiscalToFoyerMembers(
  foyerId: number,
  fiscal: FiscalFields
): Promise<Contact[]> {
  const members = await getContactsByFoyer(foyerId);
  const updated: Contact[] = [];
  for (const member of members) {
    updated.push(await updateContactFiscal(member.id, fiscal));
  }
  return updated;
}
