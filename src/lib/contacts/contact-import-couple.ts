import type { Contact } from "@/lib/api/tauri-contacts";

/** Résultat d'analyse d'une ligne Excel « couple ». */
export interface CoupleImportAnalysis {
  shouldSkipContact: boolean;
  foyerId: number | null;
  contact1: Contact | null;
  contact2: Contact | null;
  prenom1?: string;
  prenom2?: string;
  nom1?: string;
  nom2?: string;
  shouldCreateContacts?: boolean;
  shouldCreateContact1?: boolean;
  shouldCreateContact2?: boolean;
}

/** Nom de famille principal (ex. « NOM1 et NOM2 » → « NOM1-NOM2 »). */
export function extractCompositeName(nom: string): string {
  if (nom.includes(" et ") || nom.includes(" & ")) {
    const parts = nom.split(/ et | & /).map((p) => p.trim());
    return parts.join("-");
  }
  return nom;
}

export function isContactCouple(prenom: string): boolean {
  const prenomLower = prenom.toLowerCase();
  return prenomLower.includes(" et ") || prenomLower.includes(" & ");
}

export function extractCoupleNames(
  prenomCouple: string
): { prenom1: string; prenom2: string } | null {
  const separators = [" et ", " & ", " ET ", " Et "];
  for (const sep of separators) {
    if (prenomCouple.includes(sep)) {
      const parts = prenomCouple.split(sep).map((p) => p.trim());
      if (parts.length === 2) {
        return { prenom1: parts[0], prenom2: parts[1] };
      }
    }
  }
  return null;
}

export function extractIndividualNames(
  nom: string
): { nom1: string; nom2: string } | null {
  if (nom.includes(" et ") || nom.includes(" & ")) {
    const parts = nom.split(/ et | & /).map((p) => p.trim().toUpperCase());
    if (parts.length >= 2) {
      return { nom1: parts[0], nom2: parts[1] };
    }
  }
  return null;
}

export function findFoyerForCouple(
  nom: string,
  prenom1: string,
  prenom2: string,
  allContacts: Contact[]
): number | null {
  const nomUpper = nom.toUpperCase();
  const prenom1Upper = prenom1.toUpperCase();
  const prenom2Upper = prenom2.toUpperCase();
  const individualNames = extractIndividualNames(nom);
  const nom1 = individualNames?.nom1 || nomUpper;
  const nom2 = individualNames?.nom2 || nomUpper;

  const contact1 = allContacts.find(
    (c) =>
      (c.nom.toUpperCase() === nom1 || c.nom.toUpperCase() === nomUpper) &&
      c.prenom.toUpperCase() === prenom1Upper
  );
  const contact2 = allContacts.find(
    (c) =>
      (c.nom.toUpperCase() === nom2 || c.nom.toUpperCase() === nomUpper) &&
      c.prenom.toUpperCase() === prenom2Upper
  );

  if (contact1 && contact2) {
    if (contact1.foyer_id && contact1.foyer_id === contact2.foyer_id) {
      return contact1.foyer_id;
    }
  }
  return null;
}

/** Analyse synchrone : couple Excel → contacts existants / foyer / créations. */
export function analyzeCoupleContact(
  prenom: string,
  nom: string,
  allContacts: Contact[]
): CoupleImportAnalysis {
  if (!isContactCouple(prenom, nom)) {
    return {
      shouldSkipContact: false,
      foyerId: null,
      contact1: null,
      contact2: null,
    };
  }

  const names = extractCoupleNames(prenom);
  if (!names) {
    return {
      shouldSkipContact: false,
      foyerId: null,
      contact1: null,
      contact2: null,
    };
  }

  const { prenom1, prenom2 } = names;
  const nomUpper = nom.toUpperCase();
  const prenom1Upper = prenom1.toUpperCase();
  const prenom2Upper = prenom2.toUpperCase();
  const individualNames = extractIndividualNames(nom);
  const nom1 = individualNames?.nom1 || nomUpper;
  const nom2 = individualNames?.nom2 || nomUpper;

  const contact1 = allContacts.find(
    (c) =>
      (c.nom.toUpperCase() === nom1 || c.nom.toUpperCase() === nomUpper) &&
      c.prenom.toUpperCase() === prenom1Upper
  );
  const contact2 = allContacts.find(
    (c) =>
      (c.nom.toUpperCase() === nom2 || c.nom.toUpperCase() === nomUpper) &&
      c.prenom.toUpperCase() === prenom2Upper
  );

  if (contact1 && contact2) {
    const foyerId = findFoyerForCouple(nom, prenom1, prenom2, allContacts);
    return {
      shouldSkipContact: true,
      foyerId,
      contact1,
      contact2,
      prenom1,
      prenom2,
      nom1,
      nom2,
    };
  }

  if (contact1 && !contact2) {
    return {
      shouldSkipContact: true,
      foyerId: contact1.foyer_id || null,
      contact1,
      contact2: null,
      prenom1,
      prenom2,
      nom1,
      nom2,
      shouldCreateContact2: true,
    };
  }

  if (!contact1 && contact2) {
    return {
      shouldSkipContact: true,
      foyerId: contact2.foyer_id || null,
      contact1: null,
      contact2,
      prenom1,
      prenom2,
      nom1,
      nom2,
      shouldCreateContact1: true,
    };
  }

  return {
    shouldSkipContact: true,
    foyerId: null,
    contact1: null,
    contact2: null,
    prenom1,
    prenom2,
    nom1,
    nom2,
    shouldCreateContacts: true,
  };
}
