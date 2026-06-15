import type { NewInvestissement } from "@/lib/api/tauri-investissements";

/** Propriétaire cible d'un investissement issu d'un RIO. */
export type RioPatrimoineOwner = Pick<NewInvestissement, "contact_id" | "foyer_id">;

export function isFoyerPatrimoineRio(data: {
  isCouple?: boolean;
  foyerId?: number;
}): boolean {
  return Boolean(data.isCouple && data.foyerId);
}

export function buildRioPatrimoineOwner(options: {
  contactId: number;
  foyerId?: number;
  useFoyer?: boolean;
}): RioPatrimoineOwner {
  if (options.useFoyer && options.foyerId) {
    return { foyer_id: options.foyerId };
  }
  return { contact_id: options.contactId };
}

export function attachRioPatrimoineOwner<T extends Omit<NewInvestissement, "contact_id" | "foyer_id">>(
  investissement: T,
  owner: RioPatrimoineOwner
): NewInvestissement {
  return { ...investissement, ...owner };
}

export function patrimoineOwnerLabel(options: {
  useFoyer?: boolean;
  foyerNom?: string;
  contactNom?: string;
}): string {
  if (options.useFoyer) {
    return options.foyerNom ? `Foyer ${options.foyerNom}` : "Patrimoine du foyer";
  }
  return options.contactNom ?? "Contact";
}
