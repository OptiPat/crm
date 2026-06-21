import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { InvestWithCommun } from "@/lib/familles/famille-types";

export type ContactPatrimoineData = {
  investissements: InvestWithCommun[];
  patrimoinePerso: number;
  patrimoineCommun: number;
  total: number;
  avecMoiPerso: number;
  avecMoiCommun: number;
  avecMoiTotal: number;
};

/** Patrimoine d'un contact : investissements personnels + part commune du foyer. */
export function getContactPatrimoine(
  contact: Contact,
  investissementsByContact: Record<number, Investissement[]>,
  investissementsByFoyer: Record<number, Investissement[]>
): ContactPatrimoineData {
  const contactInvests: InvestWithCommun[] = (
    investissementsByContact[contact.id!] || []
  ).map((inv) => ({ ...inv, isCommun: false }));

  let foyerInvests: InvestWithCommun[] = [];
  if (contact.foyer_id) {
    const allFoyerInvests = investissementsByFoyer[contact.foyer_id] || [];
    foyerInvests = allFoyerInvests
      .filter((inv) => !inv.contact_id)
      .map((inv) => ({ ...inv, isCommun: true }));
  }

  const patrimoinePerso = contactInvests.reduce(
    (sum, inv) => sum + (inv.montant_initial || 0),
    0
  );
  const patrimoineCommun = foyerInvests.reduce(
    (sum, inv) => sum + (inv.montant_initial || 0),
    0
  );
  const total = patrimoinePerso + patrimoineCommun;

  const avecMoiPerso = contactInvests
    .filter((inv) => inv.origine === "MON_CONSEIL")
    .reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
  const avecMoiCommun = foyerInvests
    .filter((inv) => inv.origine === "MON_CONSEIL")
    .reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);

  return {
    investissements: [...contactInvests, ...foyerInvests],
    patrimoinePerso,
    patrimoineCommun,
    total,
    avecMoiPerso,
    avecMoiCommun,
    avecMoiTotal: avecMoiPerso + avecMoiCommun,
  };
}
