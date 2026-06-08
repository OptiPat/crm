import type { Contact, NewContact } from "@/lib/api/tauri-contacts";
import { unixToDateInput } from "@/lib/dates/calendar-date";

export const CLIENT_STATUTS = ["AUCUN", "CLIENT", "PROSPECT_CLIENT", "SUSPECT_CLIENT"] as const;
export const FILLEUL_STATUTS = [
  "FILLEUL",
  "PROSPECT_FILLEUL",
  "SUSPECT_FILLEUL",
  "FILLEUL_DESINSCRIT",
] as const;

export type ClientStatut = (typeof CLIENT_STATUTS)[number];
export type FilleulStatut = (typeof FILLEUL_STATUTS)[number];
export type Civilite = "M" | "MME" | "AUTRE";
export type SituationFamiliale =
  | "CELIBATAIRE"
  | "MARIE"
  | "PACSE"
  | "DIVORCE"
  | "VEUF"
  | "AUTRE";
export type ContactFormContext = "clients" | "filleuls" | "prescripteurs" | "detail";
export const SELECT_NONE = "__none__";

export type FieldErrors = {
  nom?: string;
  prenom?: string;
  email?: string;
  profil_risque_sri?: string;
};

export function isFilleulStatut(cat?: string | null): cat is FilleulStatut {
  return !!cat && (FILLEUL_STATUTS as readonly string[]).includes(cat);
}

export function isPrescripteurCategorie(cat?: string | null): boolean {
  return cat === "PRESCRIPTEUR";
}

export function isClientActif(cat?: string): boolean {
  return !!cat && cat !== "AUCUN" && !isPrescripteurCategorie(cat);
}

export function toDateInput(dateValue: string | number | undefined | null): string {
  if (!dateValue) return "";
  try {
    if (typeof dateValue === "number") {
      return unixToDateInput(dateValue);
    }
    if (typeof dateValue === "string") {
      const date = new Date(dateValue);
      if (isNaN(date.getTime())) return "";
      return date.toISOString().split("T")[0];
    }
    return "";
  } catch {
    return "";
  }
}

export function dateFieldToIso(field?: string): string | undefined {
  if (!field?.trim()) return undefined;
  const [year, month, day] = field.split("-").map(Number);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) {
    return undefined;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function todayLocal(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function addMonthsLocal(months: number, referenceDate: Date = new Date()): string {
  const d = new Date(referenceDate);
  d.setMonth(d.getMonth() + months);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Prochain suivi client : J+1 an. */
export function defaultProchainSuiviClient(referenceDate: Date = new Date()): string {
  return addMonthsLocal(12, referenceDate);
}

/** Prochain suivi filleul, prospect ou suspect client : J+6 mois. */
export function defaultProchainSuiviSixMois(referenceDate: Date = new Date()): string {
  return addMonthsLocal(6, referenceDate);
}

export function defaultProchainSuiviForClientStatut(
  categorie: string | undefined,
  referenceDate: Date = new Date()
): string {
  if (categorie === "CLIENT") return defaultProchainSuiviClient(referenceDate);
  if (categorie === "PROSPECT_CLIENT" || categorie === "SUSPECT_CLIENT") {
    return defaultProchainSuiviSixMois(referenceDate);
  }
  return "";
}

export function formatPhoneFR(value: string): string {
  const digits = value.replace(/\D/g, "").slice(0, 10);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

const BASE_EMPTY: NewContact = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  adresse: "",
  code_postal: "",
  ville: "",
  date_naissance: "",
  profession: "",
  source_lead: "",
  profil_risque_sri: undefined,
  date_dernier_contact: "",
  date_prochain_suivi: "",
  date_dernier_contact_filleul: "",
  date_prochain_suivi_filleul: "",
  statut_suivi: "ACTIF",
  registre: "VOUS",
  notes: "",
  parrain_id: undefined,
  prescripteur_id: undefined,
};

export function getEmptyForm(context: ContactFormContext): NewContact {
  if (context === "filleuls") {
    return {
      ...BASE_EMPTY,
      categorie: "AUCUN",
      filleul_categorie: "SUSPECT_FILLEUL",
      date_prochain_suivi_filleul: defaultProchainSuiviSixMois(),
    };
  }
  if (context === "prescripteurs") {
    return {
      ...BASE_EMPTY,
      categorie: "PRESCRIPTEUR",
      filleul_categorie: undefined,
    };
  }
  return {
    ...BASE_EMPTY,
    categorie: "SUSPECT_CLIENT",
    filleul_categorie: undefined,
    date_prochain_suivi: defaultProchainSuiviSixMois(),
  };
}

export function contactToFormData(contact: Contact): NewContact {
  const clientCats = CLIENT_STATUTS as readonly string[];
  let categorie = contact.categorie || "AUCUN";
  let filleul_categorie = contact.filleul_categorie || undefined;

  if (!filleul_categorie && isFilleulStatut(contact.categorie)) {
    filleul_categorie = contact.categorie;
    categorie = "AUCUN";
  } else if (
    (!clientCats.includes(categorie) || isFilleulStatut(categorie)) &&
    !isPrescripteurCategorie(categorie)
  ) {
    categorie = "AUCUN";
  }

  return {
    categorie,
    filleul_categorie,
    parrain_id: contact.parrain_id || undefined,
    prescripteur_id: contact.prescripteur_id || undefined,
    foyer_id: contact.foyer_id || undefined,
    famille_id: contact.famille_id || undefined,
    role_foyer: contact.role_foyer || undefined,
    role_famille: contact.role_famille || undefined,
    civilite: contact.civilite || undefined,
    situation_familiale: contact.situation_familiale || undefined,
    date_dernier_contact_filleul: toDateInput(contact.date_dernier_contact_filleul),
    date_prochain_suivi_filleul: toDateInput(contact.date_prochain_suivi_filleul),
    nom: contact.nom || "",
    prenom: contact.prenom || "",
    email: contact.email || "",
    telephone: contact.telephone || "",
    adresse: contact.adresse || "",
    code_postal: contact.code_postal || "",
    ville: contact.ville || "",
    date_naissance: toDateInput(contact.date_naissance),
    profession: contact.profession || "",
    source_lead: contact.source_lead || "",
    profil_risque_sri: contact.profil_risque_sri || undefined,
    date_dernier_contact: toDateInput(contact.date_dernier_contact),
    date_prochain_suivi: toDateInput(contact.date_prochain_suivi),
    statut_suivi: contact.statut_suivi || "ACTIF",
    registre: contact.registre?.trim() || "VOUS",
    notes: contact.notes || "",
    famille_regroupement_exclu: contact.famille_regroupement_exclu ?? false,
  };
}

export function getFieldErrors(formData: NewContact): FieldErrors {
  const errors: FieldErrors = {};
  if (!formData.nom?.trim()) errors.nom = "Le nom est obligatoire";
  if (!formData.prenom?.trim()) errors.prenom = "Le prénom est obligatoire";
  const email = formData.email?.trim();
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = "Adresse email invalide";
  }
  const sri = formData.profil_risque_sri;
  if (sri !== undefined && (sri < 1 || sri > 7)) {
    errors.profil_risque_sri = "Doit être entre 1 et 7";
  }
  return errors;
}

export function buildSubmitPayload(formData: NewContact): NewContact {
  const clientActif = isClientActif(formData.categorie);
  const filleulActif = isFilleulStatut(formData.filleul_categorie);

  return {
    ...formData,
    nom: formData.nom.trim(),
    prenom: formData.prenom.trim(),
    email: formData.email?.trim() || undefined,
    civilite: formData.civilite || undefined,
    situation_familiale: formData.situation_familiale || undefined,
    categorie: formData.categorie || "AUCUN",
    filleul_categorie: filleulActif ? formData.filleul_categorie : null,
    parrain_id: filleulActif ? formData.parrain_id : undefined,
    date_dernier_contact: clientActif
      ? dateFieldToIso(formData.date_dernier_contact)
      : undefined,
    date_prochain_suivi: clientActif
      ? dateFieldToIso(formData.date_prochain_suivi)
      : undefined,
    date_dernier_contact_filleul: filleulActif
      ? dateFieldToIso(formData.date_dernier_contact_filleul)
      : undefined,
    date_prochain_suivi_filleul: filleulActif
      ? dateFieldToIso(formData.date_prochain_suivi_filleul)
      : undefined,
    date_naissance: dateFieldToIso(formData.date_naissance),
    registre: formData.registre?.trim().toUpperCase() === "TU" ? "TU" : "VOUS",
  };
}

export function getClientLabel(categorie: string): string | null {
  switch (categorie) {
    case "CLIENT":
      return "Client";
    case "PROSPECT_CLIENT":
      return "Prospect client";
    case "SUSPECT_CLIENT":
      return "Suspect client";
    case "PRESCRIPTEUR":
      return "Prescripteur";
    default:
      return null;
  }
}

export function getFilleulLabel(cat?: string | null): string | null {
  switch (cat) {
    case "FILLEUL":
      return "Filleul";
    case "PROSPECT_FILLEUL":
      return "Prospect filleul";
    case "SUSPECT_FILLEUL":
      return "Suspect filleul";
    case "FILLEUL_DESINSCRIT":
      return "Filleul désinscrit";
    default:
      return null;
  }
}

export function serializeFormSnapshot(data: NewContact): string {
  return JSON.stringify(data);
}

/** Catégories client/filleul pour l'import Excel général (colonne « Prospects Filleuls »). */
export function resolveImportContactCategories(
  hasProduit: boolean,
  hasContact: boolean,
  isFilleul: boolean
): { categorie: string; filleul_categorie?: string } {
  if (hasProduit) {
    return {
      categorie: "CLIENT",
      filleul_categorie: isFilleul ? "FILLEUL" : undefined,
    };
  }
  if (isFilleul) {
    return {
      categorie: "AUCUN",
      filleul_categorie: hasContact ? "PROSPECT_FILLEUL" : "SUSPECT_FILLEUL",
    };
  }
  return {
    categorie: hasContact ? "PROSPECT_CLIENT" : "SUSPECT_CLIENT",
    filleul_categorie: undefined,
  };
}

/** Payload complet pour updateContact (evite d'ecraser civilite, dates, etc.). */
export function contactToUpdatePayload(
  contact: Contact,
  overrides: Partial<NewContact> = {}
): NewContact {
  return buildSubmitPayload({ ...contactToFormData(contact), ...overrides });
}

/** Alertes réseau filleul (ex. SUIVI_FILLEUL_1AN, FILLEUL_SUIVI_6MOIS). */
export function isAlerteSuiviFilleul(typeAlerte: string): boolean {
  return typeAlerte.includes("FILLEUL");
}

/** Champs date à mettre à jour selon le type d'alerte (client vs filleul). */
export function suiviDatesOverrides(
  typeAlerte: string,
  dates: { dernierContact: string; prochainSuivi?: string }
): Partial<NewContact> {
  if (isAlerteSuiviFilleul(typeAlerte)) {
    return {
      date_dernier_contact_filleul: dates.dernierContact,
      ...(dates.prochainSuivi
        ? { date_prochain_suivi_filleul: dates.prochainSuivi }
        : {}),
    };
  }
  return {
    date_dernier_contact: dates.dernierContact,
    ...(dates.prochainSuivi ? { date_prochain_suivi: dates.prochainSuivi } : {}),
  };
}

export function formatCiviliteLabel(civilite?: string | null): string | null {
  switch (civilite) {
    case "M":
      return "Monsieur";
    case "MME":
      return "Madame";
    case "AUTRE":
      return "Autre";
    default:
      return null;
  }
}

export function formatSituationLabel(situation?: string | null): string | null {
  const labels: Record<string, string> = {
    CELIBATAIRE: "Célibataire",
    MARIE: "Marié(e)",
    PACSE: "Pacsé(e)",
    DIVORCE: "Divorcé(e)",
    VEUF: "Veuf(ve)",
    AUTRE: "Autre",
  };
  return situation ? labels[situation] || situation : null;
}
