import type { Contact, NewContact } from "@/lib/api/tauri-contacts";
import { PROFIL_RISQUE_MAX } from "@/lib/contacts/investisseur-sri";
import { parseFrenchDateToIso } from "@/lib/contacts/rio-couple-import";
import type { ExtractedData } from "@/lib/pdf/types";
import { sanitizeStelliumFieldValue } from "@/lib/pdf/stellium/normalize";

const CIVILITE_MAP: Record<string, "M" | "MME" | "AUTRE"> = {
  M: "M",
  "M.": "M",
  MONSIEUR: "M",
  MME: "MME",
  MADAME: "MME",
};

const SITUATION_MAP: Record<
  string,
  "CELIBATAIRE" | "MARIE" | "PACSE" | "UNION_LIBRE" | "DIVORCE" | "VEUF" | "AUTRE"
> = {
  CELIBATAIRE: "CELIBATAIRE",
  MARIE: "MARIE",
  MARIÉ: "MARIE",
  MARIEE: "MARIE",
  MARIÉE: "MARIE",
  PACSE: "PACSE",
  PACS: "PACSE",
  PACSÉ: "PACSE",
  PACSEE: "PACSE",
  UNION_LIBRE: "UNION_LIBRE",
  "UNION LIBRE": "UNION_LIBRE",
  CONCUBINAGE: "UNION_LIBRE",
  DIVORCE: "DIVORCE",
  DIVORCÉ: "DIVORCE",
  DIVORCEE: "DIVORCE",
  DIVORCÉE: "DIVORCE",
  VEUF: "VEUF",
  VEUVE: "VEUF",
};

export function formatRioObjectifs(objectifs?: string[]): string | undefined {
  if (!objectifs?.length) return undefined;
  const lines = objectifs.map((o) => o.trim()).filter(Boolean);
  return lines.length > 0 ? lines.join(" ; ") : undefined;
}

/** Affichage preview import : une ligne par objectif (table RIO). */
export function formatRioObjectifsLines(objectifs?: string[]): string | undefined {
  if (!objectifs?.length) return undefined;
  const lines = objectifs.map((o) => o.trim()).filter(Boolean);
  return lines.length > 0 ? lines.join("\n") : undefined;
}

/** Inverse de formatRioObjectifs / saisie preview (lignes ou « ; »). */
export function parseRioObjectifsText(text: string): string[] {
  return text
    .split(/\n|;/)
    .map((o) => o.trim())
    .filter(Boolean);
}

export function normalizeRegimeMatrimonial(value?: string): string | undefined {
  return sanitizeStelliumFieldValue(value);
}

/** Charges d'emprunts = crédit conso (section Charges) + échéances Passifs. */
export function resolveChargesEmprunts(data: ExtractedData): number | undefined {
  const charges = data.chargesEmprunts ?? 0;
  const passifs = data.chargesEmpruntsPassifs ?? 0;
  const total = charges + passifs;
  if (total > 0) return total;
  if (data.chargesTotal != null && data.chargesTotal > 0) return data.chargesTotal;
  return undefined;
}

export function resolveRevenusAnnuels(data: ExtractedData): number | undefined {
  const total = data.revenusTotal ?? data.revenusSalaires;
  return total != null && total > 0 ? total : undefined;
}

function sumChargesEmprunts(
  conso?: number,
  passifs?: number
): number | undefined {
  const total = (conso ?? 0) + (passifs ?? 0);
  return total > 0 ? total : undefined;
}

export function buildSoloRioContactFields(
  data: ExtractedData,
  options?: { includeFinancial?: boolean }
): Partial<NewContact> {
  const fields = buildSoloRioIdentityContactFields(data);
  if (options?.includeFinancial !== false) {
    Object.assign(fields, buildSoloRioFinancialContactFields(data));
  }
  return fields;
}

export function buildSoloRioIdentityContactFields(data: ExtractedData): Partial<NewContact> {
  const fields: Partial<NewContact> = {
    nom: data.nom?.trim() || "",
    prenom: data.prenom?.trim() || "",
    categorie: "SUSPECT_CLIENT",
    statut_suivi: "ACTIF",
  };

  if (data.civilite) {
    fields.civilite = CIVILITE_MAP[data.civilite.toUpperCase()] || "AUTRE";
  }
  if (data.email?.trim()) fields.email = data.email.trim();
  if (data.telephone?.trim()) fields.telephone = data.telephone.trim();
  if (data.adresse?.trim()) fields.adresse = data.adresse.trim();
  if (data.codePostal?.trim()) fields.code_postal = data.codePostal.trim();
  if (data.ville?.trim()) fields.ville = data.ville.trim();
  if (data.lieuNaissance?.trim()) fields.lieu_naissance = data.lieuNaissance.trim();
  if (data.profession?.trim()) fields.profession = data.profession.trim();
  else if (data.employeur?.trim()) fields.profession = data.employeur.trim();

  if (data.dateNaissance) {
    const iso = parseFrenchDateToIso(data.dateNaissance);
    if (iso) fields.date_naissance = iso;
  }

  if (data.situationFamiliale) {
    fields.situation_familiale =
      SITUATION_MAP[data.situationFamiliale.toUpperCase()] || "AUTRE";
  }

  const regime = normalizeRegimeMatrimonial(data.regimeMatrimonial);
  if (regime) fields.regime_matrimonial = regime;

  return fields;
}

export function buildSoloRioFinancialContactFields(data: ExtractedData): Partial<NewContact> {
  const fields: Partial<NewContact> = {};

  const revenus = resolveRevenusAnnuels(data);
  if (revenus != null) fields.revenus_annuels = revenus;

  const charges = resolveChargesEmprunts(data);
  if (charges != null) fields.charges_emprunts = charges;

  const objectifs = formatRioObjectifs(data.objectifsPrincipaux);
  if (objectifs) fields.objectifs_patrimoniaux = objectifs;

  if (data.profilRisque != null && data.profilRisque >= 1 && data.profilRisque <= PROFIL_RISQUE_MAX) {
    fields.profil_risque_sri = data.profilRisque;
  }

  return fields;
}

export function buildCoupleMemberRioFinancialFields(
  data: ExtractedData,
  member: "person1" | "person2"
): Partial<NewContact> {
  const partial: Partial<NewContact> = {};
  const base =
    member === "person1"
      ? {
          revenusTotal: data.revenusTotal ?? data.revenusSalaires,
          chargesEmprunts: sumChargesEmprunts(
            data.chargesEmprunts,
            data.chargesEmpruntsPassifs
          ),
        }
      : {
          revenusTotal: data.conjoint?.revenusTotal,
          chargesEmprunts: sumChargesEmprunts(
            data.conjoint?.chargesEmprunts,
            data.conjoint?.chargesEmpruntsPassifs
          ),
        };

  if (base.revenusTotal != null && base.revenusTotal > 0) {
    partial.revenus_annuels = base.revenusTotal;
  }
  if (base.chargesEmprunts != null && base.chargesEmprunts > 0) {
    partial.charges_emprunts = base.chargesEmprunts;
  }

  if (member === "person1") {
    const objectifs = formatRioObjectifs(data.objectifsPrincipaux);
    if (objectifs) partial.objectifs_patrimoniaux = objectifs;
    if (data.profilRisque != null && data.profilRisque >= 1 && data.profilRisque <= PROFIL_RISQUE_MAX) {
      partial.profil_risque_sri = data.profilRisque;
    }
  }

  return partial;
}

export function buildCoupleMemberRioFields(
  data: ExtractedData,
  member: "person1" | "person2",
  options?: { includeFinancial?: boolean }
): Partial<NewContact> {
  const base =
    member === "person1"
      ? {
          civilite: data.civilite,
          nom: data.nom,
          prenom: data.prenom,
          email: data.email,
          telephone: data.telephone ?? data.telephoneMobile,
          adresse: data.adresse,
          codePostal: data.codePostal,
          ville: data.ville,
          dateNaissance: data.dateNaissance,
          lieuNaissance: data.lieuNaissance,
          profession: data.profession,
        }
      : {
          civilite: data.conjoint?.civilite,
          nom: data.conjoint?.nom,
          prenom: data.conjoint?.prenom,
          email: data.conjoint?.email,
          telephone: data.conjoint?.telephone,
          adresse: data.adresse,
          codePostal: data.codePostal,
          ville: data.ville,
          dateNaissance: data.conjoint?.dateNaissance,
          lieuNaissance: data.conjoint?.lieuNaissance,
          profession: data.conjoint?.profession,
        };

  const partial: Partial<NewContact> = {
    nom: base.nom?.trim() || "",
    prenom: base.prenom?.trim() || "",
    categorie: "SUSPECT_CLIENT",
    statut_suivi: "ACTIF",
  };

  if (base.civilite) {
    partial.civilite = CIVILITE_MAP[base.civilite.toUpperCase()] || "AUTRE";
  }
  if (base.email?.trim()) partial.email = base.email.trim();
  if (base.telephone?.trim()) partial.telephone = base.telephone.trim();
  if (base.adresse?.trim()) partial.adresse = base.adresse.trim();
  if (base.codePostal?.trim()) partial.code_postal = base.codePostal.trim();
  if (base.ville?.trim()) partial.ville = base.ville.trim();
  if (base.lieuNaissance?.trim()) partial.lieu_naissance = base.lieuNaissance.trim();
  if (base.profession?.trim()) partial.profession = base.profession.trim();

  if (base.dateNaissance) {
    const iso = parseFrenchDateToIso(base.dateNaissance);
    if (iso) partial.date_naissance = iso;
  }

  if (data.situationFamiliale) {
    partial.situation_familiale =
      SITUATION_MAP[data.situationFamiliale.toUpperCase()] || "AUTRE";
  }

  const regime = normalizeRegimeMatrimonial(data.regimeMatrimonial);
  if (regime) partial.regime_matrimonial = regime;

  if (options?.includeFinancial !== false) {
    Object.assign(partial, buildCoupleMemberRioFinancialFields(data, member));
  }

  return partial;
}

export interface MergeRioFieldsOptions {
  /** Ré-import : ne pas écraser identité/coordonnées déjà renseignées. */
  identityFillEmptyOnly?: boolean;
}

/** Fusionne les champs RIO sur une fiche existante (RIO prioritaire si valeur présente). */
export function mergeRioFieldsOntoContact(
  existing: Contact,
  rio: Partial<NewContact>,
  options?: MergeRioFieldsOptions
): Partial<NewContact> {
  const identityOnly = options?.identityFillEmptyOnly ?? false;

  const pickStr = (next?: string, prev?: string, identityField = false) => {
    if (identityOnly && identityField) {
      return prev?.trim() ? prev.trim() : next?.trim() || undefined;
    }
    return next?.trim() ? next.trim() : prev || undefined;
  };

  const pickOptional = <T>(next: T | undefined, prev: T | undefined, identityField = false) => {
    if (identityOnly && identityField && prev != null && prev !== "") {
      return prev;
    }
    return next ?? prev;
  };

  const merged: Partial<NewContact> = {
    nom: pickStr(rio.nom, existing.nom, true) || existing.nom,
    prenom: pickStr(rio.prenom, existing.prenom, true) || existing.prenom,
    civilite: pickOptional(rio.civilite, existing.civilite, true),
    email: pickStr(rio.email, existing.email, true),
    telephone: pickStr(rio.telephone, existing.telephone, true),
    adresse: pickStr(rio.adresse, existing.adresse, true),
    code_postal: pickStr(rio.code_postal, existing.code_postal, true),
    ville: pickStr(rio.ville, existing.ville, true),
    lieu_naissance: pickStr(rio.lieu_naissance, existing.lieu_naissance, true),
    profession: pickStr(rio.profession, existing.profession, true),
    situation_familiale: pickOptional(
      rio.situation_familiale,
      existing.situation_familiale,
      true
    ),
    regime_matrimonial: pickOptional(
      rio.regime_matrimonial,
      existing.regime_matrimonial,
      true
    ),
    revenus_annuels: rio.revenus_annuels ?? existing.revenus_annuels,
    charges_emprunts: rio.charges_emprunts ?? existing.charges_emprunts,
    objectifs_patrimoniaux: rio.objectifs_patrimoniaux ?? existing.objectifs_patrimoniaux,
    profil_risque_sri: rio.profil_risque_sri ?? existing.profil_risque_sri,
  };

  if (rio.date_naissance && (!identityOnly || !existing.date_naissance)) {
    merged.date_naissance = rio.date_naissance;
  }

  return merged;
}
