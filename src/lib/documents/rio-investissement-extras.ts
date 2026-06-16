import type { NewInvestissement } from "@/lib/api/tauri-investissements";
import { isPlacementEncoursEligible } from "@/lib/investissements/investissement-encours";
import { isImmobilierFinancingType } from "@/lib/investissements/investissement-immo-financing";

export interface RioImmoInvestissementInput {
  editedType: string;
  mensualiteCredit?: number;
  creditCRD?: number;
  loyerMensuel?: number;
  dateFinCredit?: string;
  notes?: string;
}

function parseFrDateToIso(date?: string): string | undefined {
  if (!date) return undefined;
  const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!match) return undefined;
  return `${match[3]}-${match[2]}-${match[1]}T00:00:00Z`;
}

export function buildImmoInvestissementExtras(
  input: RioImmoInvestissementInput
): Partial<NewInvestissement> {
  if (!isImmobilierFinancingType(input.editedType)) {
    return input.notes ? { notes: input.notes } : {};
  }

  const extras: Partial<NewInvestissement> = {};
  if (input.mensualiteCredit != null && input.mensualiteCredit > 0) {
    extras.mensualite_credit = Math.round(input.mensualiteCredit * 100);
  }
  if (input.creditCRD != null && input.creditCRD > 0) {
    extras.credit_crd = Math.round(input.creditCRD * 100);
  }
  if (input.loyerMensuel != null && input.loyerMensuel > 0) {
    extras.loyer_mensuel = Math.round(input.loyerMensuel * 100);
  }
  const dateFinPret = parseFrDateToIso(input.dateFinCredit);
  if (dateFinPret) {
    extras.date_fin_pret = dateFinPret;
  }
  if (input.notes) {
    extras.notes = input.notes;
  }
  return extras;
}

export function usesRioEncoursMontant(type: string): boolean {
  return isPlacementEncoursEligible(type);
}

export function buildPatrimoineMontantInitial(
  type: string,
  montantEuro: number
): number | undefined {
  if (usesRioEncoursMontant(type)) {
    return undefined;
  }
  return Math.round(montantEuro * 100);
}

export function buildRioValorisationDateIso(data: {
  dateDocument?: string;
  dateEntreeRelation?: string;
}): string {
  const parseFr = (date?: string) => {
    if (!date) return undefined;
    const match = date.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return undefined;
    return `${match[3]}-${match[2]}-${match[1]}T00:00:00Z`;
  };
  return (
    parseFr(data.dateDocument) ??
    parseFr(data.dateEntreeRelation) ??
    `${new Date().toISOString().slice(0, 10)}T00:00:00Z`
  );
}
