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

/**
 * Fiscalité à afficher pour un contact : valeur du contact, sinon fallback foyer.
 *
 * Après n'importe quelle édition (fiche contact ou fiche foyer), contact et foyer
 * sont synchronisés à l'identique — il n'y a donc pas de conflit. Le fallback ne
 * sert que pour l'existant non rétro-rempli (foyer renseigné, copie contact vide).
 */
export function resolveContactFiscal(
  contact: Partial<FiscalFields> | null | undefined,
  foyer: Partial<FiscalFields> | null | undefined
): FiscalFields {
  return {
    tranche_imposition:
      contact?.tranche_imposition ?? foyer?.tranche_imposition,
    nombre_parts_fiscales:
      contact?.nombre_parts_fiscales ?? foyer?.nombre_parts_fiscales,
    revenu_fiscal_reference:
      contact?.revenu_fiscal_reference ?? foyer?.revenu_fiscal_reference,
    ir_net_a_payer: contact?.ir_net_a_payer ?? foyer?.ir_net_a_payer,
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
