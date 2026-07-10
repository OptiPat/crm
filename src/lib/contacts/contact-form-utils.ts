import type { Contact, NewContact } from "@/lib/api/tauri-contacts";
import { parseFilleulVolumeField } from "@/lib/organisation/organisation-branch-volumes";
import { PROFIL_RISQUE_MAX, PROFIL_RISQUE_SRI_FIELD_LABEL } from "@/lib/contacts/investisseur-sri";
import { unwrapImportCell } from "@/lib/contacts/import-row";
import { parseImportDate } from "@/lib/contacts/parse-import-date";
import { unixToDateInput } from "@/lib/dates/calendar-date";

export const CLIENT_STATUTS = ["AUCUN", "CLIENT", "PROSPECT_CLIENT", "SUSPECT_CLIENT"] as const;
export const FILLEUL_STATUTS = [
  "FILLEUL",
  "PROSPECT_FILLEUL",
  "SUSPECT_FILLEUL",
  "FILLEUL_DESINSCRIT",
] as const;

export type ClientStatut = (typeof CLIENT_STATUTS)[number];
export type ClientStatutSelectValue = ClientStatut | "PRESCRIPTEUR" | "ANCIEN_CLIENT";
export type FilleulStatut = (typeof FILLEUL_STATUTS)[number];
export type Civilite = "M" | "MME" | "AUTRE";
export type SituationFamiliale =
  | "CELIBATAIRE"
  | "MARIE"
  | "PACSE"
  | "UNION_LIBRE"
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

/** Filleul inscrit actif dans le réseau (onglet Parrainage du formulaire). */
export function isFilleulReseauInscrit(cat?: string | null): boolean {
  return cat === "FILLEUL";
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
  const trimmed = field.trim();
  if (trimmed.includes("T")) {
    const parsed = new Date(trimmed);
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString();
  }
  const [year, month, day] = trimmed.split("-").map(Number);
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
  const digits = normalizePhoneDigits(value).slice(0, 10);
  return digits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
}

export function normalizePhoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Saisie libre : + en tête, chiffres et espaces. */
export function sanitizePhoneInput(value: string): string {
  const trimmed = value.trimStart();
  let out = "";
  for (const ch of trimmed) {
    if (ch === "+" && out === "") out += ch;
    else if (/\d/.test(ch)) out += ch;
    else if (ch === " " && out.length > 0) out += ch;
  }
  return out;
}

/** Format FR (10 chiffres) ou international (+33 …). */
export function formatPhoneInput(value: string): string {
  const sanitized = sanitizePhoneInput(value.trim());
  if (!sanitized) return "";

  if (sanitized.startsWith("+") || sanitized.replace(/\s/g, "").startsWith("00")) {
    const intlDigits = sanitized.startsWith("+")
      ? normalizePhoneDigits(sanitized.slice(1))
      : normalizePhoneDigits(sanitized).slice(2);
    if (!intlDigits) return "+";
    if (intlDigits.startsWith("33")) {
      const national = intlDigits.slice(2, 11);
      if (!national) return "+33";
      const head = national.slice(0, 1);
      const tailSpaced = national.slice(1).replace(/(\d{2})(?=\d)/g, "$1 ").trim();
      return tailSpaced ? `+33 ${head} ${tailSpaced}` : `+33 ${head}`;
    }
    const spaced = intlDigits.replace(/(\d{2})(?=\d)/g, "$1 ").trim();
    return `+${spaced}`;
  }

  return formatPhoneFR(sanitized);
}

/**
 * Normalise un téléphone lu depuis Excel / Finzzle (wrapper `="+33…"`, `+ ()`, points…)
 * vers le même affichage que la fiche contact (`formatPhoneInput`).
 */
export function normalizeImportTelephone(value: unknown): string {
  const unwrapped = unwrapImportCell(value);
  if (unwrapped == null || unwrapped === "") return "";
  let s = String(unwrapped).trim();
  if (!s) return "";

  s = s.replace(/^\+?\s*\(\s*\)\s*/i, "");
  s = s.replace(/\./g, "");
  s = s.replace(/\s+/g, " ").trim();
  if (!s) return "";

  const digits = normalizePhoneDigits(s);
  if (!digits) return "";

  if (digits.length === 10 && digits.startsWith("0")) {
    return formatPhoneInput(digits);
  }

  if (digits.length === 11 && digits.startsWith("33")) {
    return formatPhoneInput(`+${digits}`);
  }

  // Export Finzzle : 33 + 0 + mobile (12 chiffres, ex. 330608355299)
  if (digits.length === 12 && digits.startsWith("330")) {
    return formatPhoneInput(`+33${digits.slice(3)}`);
  }

  const after33 = digits.startsWith("33") ? digits.slice(2) : "";
  if (after33.length === 10 && after33.startsWith("0")) {
    return formatPhoneInput(`+33${after33.slice(1)}`);
  }
  if (after33.length === 9 && /^[67]\d/.test(after33)) {
    return formatPhoneInput(`+33${after33}`);
  }

  return formatPhoneInput(s);
}

export type ContactAddressFields = Pick<NewContact, "adresse" | "code_postal" | "ville" | "pays">;

export function isContactAddressEmpty(fields: ContactAddressFields): boolean {
  return !(
    fields.adresse?.trim() ||
    fields.code_postal?.trim() ||
    fields.ville?.trim() ||
    fields.pays?.trim()
  );
}

export function pickFoyerMemberAddress(
  contacts: Contact[],
  foyerId: number,
  excludeContactId?: number
): ContactAddressFields | null {
  const targetFoyerId = Number(foyerId);
  const donor = contacts.find(
    (c) =>
      c.foyer_id != null &&
      Number(c.foyer_id) === targetFoyerId &&
      c.id !== excludeContactId &&
      !isContactAddressEmpty(c)
  );
  if (!donor) return null;
  return {
    adresse: donor.adresse || "",
    code_postal: donor.code_postal || "",
    ville: donor.ville || "",
    pays: donor.pays || "",
  };
}

export function applyFoyerAddressIfEmpty(
  formData: NewContact,
  contacts: Contact[],
  contactId?: number
): { formData: NewContact; fromFoyer: boolean } {
  if (!formData.foyer_id || !isContactAddressEmpty(formData)) {
    return { formData, fromFoyer: false };
  }
  const picked = pickFoyerMemberAddress(contacts, formData.foyer_id, contactId);
  if (!picked) return { formData, fromFoyer: false };
  return {
    formData: { ...formData, ...picked },
    fromFoyer: true,
  };
}

const BASE_EMPTY: NewContact = {
  nom: "",
  prenom: "",
  email: "",
  telephone: "",
  adresse: "",
  code_postal: "",
  ville: "",
  pays: "",
  date_naissance: "",
  lieu_naissance: "",
  profession: "",
  regime_matrimonial: "",
  revenus_annuels: undefined,
  charges_emprunts: undefined,
  epargne_precaution_souhaitee: undefined,
  objectifs_patrimoniaux: "",
  source_lead: "",
  profil_risque_sri: undefined,
  date_dernier_contact: "",
  date_prochain_suivi: "",
  date_dernier_contact_filleul: "",
  date_prochain_suivi_filleul: "",
  date_r1: "",
  type_invitation_filleul: undefined,
  date_invitation_filleul: "",
  date_inscription_filleul: "",
  presence_invitation_filleul: undefined,
  statut_suivi: "ACTIF",
  registre: "VOUS",
  notes: "",
  parrain_id: undefined,
  prescripteur_id: undefined,
  filleul_titre: undefined,
  filleul_qualification: undefined,
  filleul_volume: undefined,
  filleul_volume_manager: undefined,
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
    date_r1: toDateInput(contact.date_r1),
    type_invitation_filleul: contact.type_invitation_filleul ?? undefined,
    date_invitation_filleul: toDateInput(contact.date_invitation_filleul),
    date_inscription_filleul:
      toDateInput(contact.date_inscription_filleul) ||
      toDateInput(parseDateInscriptionFromNotes(contact.notes)),
    presence_invitation_filleul: contact.presence_invitation_filleul ?? undefined,
    filleul_titre: contact.filleul_titre ?? undefined,
    filleul_qualification: contact.filleul_qualification ?? undefined,
    filleul_volume: contact.filleul_volume ?? undefined,
    filleul_volume_manager: contact.filleul_volume_manager ?? undefined,
    nom: contact.nom || "",
    prenom: contact.prenom || "",
    email: contact.email || "",
    telephone: contact.telephone || "",
    adresse: contact.adresse || "",
    code_postal: contact.code_postal || "",
    ville: contact.ville || "",
    pays: contact.pays || "",
    date_naissance: toDateInput(contact.date_naissance),
    lieu_naissance: contact.lieu_naissance || "",
    profession: contact.profession || "",
    regime_matrimonial: contact.regime_matrimonial || "",
    revenus_annuels: contact.revenus_annuels ?? undefined,
    charges_emprunts: contact.charges_emprunts ?? undefined,
    epargne_precaution_souhaitee: contact.epargne_precaution_souhaitee ?? undefined,
    objectifs_patrimoniaux: contact.objectifs_patrimoniaux || "",
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
  if (sri !== undefined && (sri < 1 || sri > PROFIL_RISQUE_MAX)) {
    errors.profil_risque_sri = `${PROFIL_RISQUE_SRI_FIELD_LABEL} : valeur entre 1 et ${PROFIL_RISQUE_MAX}`;
  }
  return errors;
}

/** `YYYY-MM-DD` ou `JJ/MM/AAAA` → ISO UTC (date de naissance). */
export function parseBirthdayFieldToIso(field?: string): string | undefined {
  if (!field?.trim()) return undefined;
  const fromInput = dateFieldToIso(field);
  if (fromInput) return fromInput;
  const fr = field.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})$/);
  if (!fr) return undefined;
  const day = parseInt(fr[1], 10);
  const month = parseInt(fr[2], 10);
  const year = parseInt(fr[3], 10);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (Number.isNaN(d.getTime())) return undefined;
  return d.toISOString();
}

export function buildSubmitPayload(
  formData: NewContact,
  options?: { alwaysSendBirthday?: boolean }
): NewContact {
  const clientActif = isClientActif(formData.categorie);
  const filleulActif = isFilleulStatut(formData.filleul_categorie);
  const birthdayRaw = formData.date_naissance?.trim() ?? "";
  let date_naissance: string | undefined;
  if (options?.alwaysSendBirthday) {
    date_naissance = birthdayRaw ? parseBirthdayFieldToIso(birthdayRaw) : "";
  } else {
    date_naissance = birthdayRaw ? parseBirthdayFieldToIso(birthdayRaw) : undefined;
  }

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
    filleul_titre: filleulActif ? formData.filleul_titre || null : null,
    filleul_qualification: filleulActif ? formData.filleul_qualification || null : null,
    filleul_volume: filleulActif ? formData.filleul_volume ?? null : null,
    filleul_volume_manager: filleulActif ? formData.filleul_volume_manager ?? null : null,
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
    date_r1: clientActif ? dateFieldToIso(formData.date_r1) : "",
    type_invitation_filleul: filleulActif
      ? formData.type_invitation_filleul || undefined
      : null,
    date_invitation_filleul: filleulActif
      ? dateFieldToIso(formData.date_invitation_filleul)
      : "",
    date_inscription_filleul: filleulActif
      ? dateFieldToIso(formData.date_inscription_filleul)
      : "",
    presence_invitation_filleul: filleulActif
      ? formData.presence_invitation_filleul === 1
        ? 1
        : formData.presence_invitation_filleul === 0
          ? 0
          : undefined
      : null,
    date_naissance,
    lieu_naissance: formData.lieu_naissance?.trim() || undefined,
    pays: formData.pays?.trim() || undefined,
    regime_matrimonial: formData.regime_matrimonial?.trim() || undefined,
    revenus_annuels: formData.revenus_annuels,
    charges_emprunts: formData.charges_emprunts,
    epargne_precaution_souhaitee: formData.epargne_precaution_souhaitee,
    objectifs_patrimoniaux: formData.objectifs_patrimoniaux?.trim() || undefined,
    registre: formData.registre?.trim().toUpperCase() === "TU" ? "TU" : "VOUS",
    notes: stripDateInscriptionFromNotes(formData.notes?.trim()) || undefined,
  };
}

/** Valeur affichée dans le sélecteur « Statut client » du formulaire. */
export function getClientStatutSelectValue(
  categorie?: string | null,
  statutSuivi?: string | null
): ClientStatutSelectValue {
  if (isPrescripteurCategorie(categorie)) return "PRESCRIPTEUR";
  if (categorie === "CLIENT" && statutSuivi === "EN_PAUSE") return "ANCIEN_CLIENT";
  if ((CLIENT_STATUTS as readonly string[]).includes(categorie ?? "")) {
    return categorie as ClientStatut;
  }
  return "AUCUN";
}

export function getClientLabel(categorie: string, statutSuivi?: string | null): string | null {
  if (categorie === "CLIENT" && statutSuivi === "EN_PAUSE") return "Ancien client";
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

/**
 * Normalise une valeur de colonne « Statut » d'import (ex. modèle Finzzle :
 * Client / Prospect / Contact) vers une catégorie client CRM. Accepte aussi
 * directement les codes CRM. Renvoie `undefined` si la valeur n'est pas reconnue,
 * pour laisser la logique d'inférence par défaut s'appliquer.
 */
export function normalizeImportStatut(value: unknown): ClientStatut | undefined {
  if (value == null) return undefined;
  const key = String(value).trim().toUpperCase();
  if (!key) return undefined;
  switch (key) {
    case "CLIENT":
      return "CLIENT";
    case "PROSPECT":
    case "PROSPECT_CLIENT":
      return "PROSPECT_CLIENT";
    case "CONTACT":
    case "SUSPECT":
    case "SUSPECT_CLIENT":
      return "SUSPECT_CLIENT";
    case "AUCUN":
      return "AUCUN";
    default:
      return undefined;
  }
}

/**
 * Normalise une civilité d'import (ex. modèle Finzzle : « Madame » / « Monsieur »)
 * vers le code CRM (M / MME / AUTRE). Renvoie `undefined` si vide/non reconnu.
 */
export function normalizeImportCivilite(value: unknown): Civilite | undefined {
  if (value == null) return undefined;
  const key = String(value).trim().toUpperCase().replace(/\./g, "");
  if (!key) return undefined;
  switch (key) {
    case "M":
    case "MR":
    case "MONSIEUR":
      return "M";
    case "MME":
    case "MRS":
    case "MADAME":
    case "MLLE":
    case "MADEMOISELLE":
      return "MME";
    case "AUTRE":
      return "AUTRE";
    default:
      return undefined;
  }
}

/**
 * Normalise une TMI importée (modèle Finzzle : nombre brut « 11 », « 30 », « - »)
 * vers le format affiché par le CRM (« 30 % »). Renvoie `undefined` si vide,
 * « - » ou non exploitable. 0 est traité comme non renseigné.
 */
export function normalizeImportTmi(value: unknown): string | undefined {
  if (value == null) return undefined;
  const raw = String(value).replace(/%/g, "").replace(",", ".").trim();
  if (!raw || raw === "-") return undefined;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return undefined;
  const display = Number.isInteger(n) ? String(n) : String(n).replace(".", ",");
  return `${display} %`;
}

/** Ville / pays import : première lettre de chaque mot en majuscule, reste en minuscule. */
export function normalizeImportPlaceName(value: unknown): string {
  const trimmed = String(value ?? "")
    .replace(/\s+/g, " ")
    .trim();
  if (!trimmed) return "";
  return trimmed
    .split(/(\s|-)/)
    .map((part) => {
      if (part === " " || part === "-") return part;
      const lower = part.toLocaleLowerCase("fr-FR");
      return lower.charAt(0).toLocaleUpperCase("fr-FR") + lower.slice(1);
    })
    .join("");
}

/**
 * Catégories client/filleul pour l'import Excel général (colonne « Prospects Filleuls »).
 * Si `explicitStatut` est fourni et reconnu (colonne « Statut » mappée), il prime sur
 * l'inférence par défaut pour la catégorie client — sauf produit (toujours CLIENT) ou filleul.
 */
export function resolveImportContactCategories(
  hasProduit: boolean,
  hasContact: boolean,
  isFilleul: boolean,
  explicitStatut?: unknown
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
  const statut = normalizeImportStatut(explicitStatut);
  return {
    categorie: statut ?? (hasContact ? "PROSPECT_CLIENT" : "SUSPECT_CLIENT"),
    filleul_categorie: undefined,
  };
}

/** Lit les champs volume parrainage encore en cours de saisie (inputs non contrôlés). */
export function mergeParrainageVolumeInputsFromDom(formData: NewContact): NewContact {
  if (typeof document === "undefined") return formData;

  const readVolume = (id: string): number | null | undefined => {
    const el = document.getElementById(id);
    if (!(el instanceof HTMLInputElement)) return undefined;
    return parseFilleulVolumeField(el.value);
  };

  let next = formData;
  const ownVolume = readVolume("filleul_volume");
  if (ownVolume != null) {
    next = { ...next, filleul_volume: ownVolume === 0 ? undefined : ownVolume };
  }
  const managerVolume = readVolume("filleul_volume_manager");
  if (managerVolume != null) {
    next = {
      ...next,
      filleul_volume_manager: managerVolume === 0 ? undefined : managerVolume,
    };
  }
  return next;
}

/** Mise à jour volume réseau exercice (Organisation). */
export function contactFilleulVolumeUpdatePayload(
  contact: Contact,
  volume: number | null
): NewContact {
  return {
    ...contactToUpdatePayload(contact),
    filleul_volume: volume,
  };
}

/** Mise à jour cumul objectif Manager (Organisation). */
export function contactFilleulManagerVolumeUpdatePayload(
  contact: Contact,
  volume: number | null
): NewContact {
  return {
    ...contactToUpdatePayload(contact),
    filleul_volume_manager: volume,
  };
}

/** Mise à jour titre / qualification (organisation), y compris sur la fiche CGP. */
export function contactFilleulRankUpdatePayload(
  contact: Contact,
  ranks: { filleul_titre?: string | null; filleul_qualification?: string | null }
): NewContact {
  return {
    ...contactToUpdatePayload(contact),
    filleul_titre: ranks.filleul_titre ?? null,
    filleul_qualification: ranks.filleul_qualification ?? null,
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
    UNION_LIBRE: "Union libre",
    DIVORCE: "Divorcé(e)",
    VEUF: "Veuf(ve)",
    AUTRE: "Autre",
  };
  return situation ? labels[situation] || situation : null;
}

export function formatStatutSuiviLabel(statut?: string | null): string {
  if (statut === "EN_PAUSE") return "Ancien client";
  if (statut === "ARCHIVE") return "Archivé";
  return "Actif";
}

const DATE_INSCRIPTION_NOTES_RE = /^Date inscription:\s*(.+?)(?:\n\n|\n|$)/m;

/** Lit la date d'inscription stockée en tête des notes filleul. */
export function parseDateInscriptionFromNotes(notes?: string | null): string | undefined {
  const match = notes?.match(DATE_INSCRIPTION_NOTES_RE);
  if (!match?.[1]) return undefined;
  return parseImportDate(match[1].trim());
}

/** Retire la ligne structurée « Date inscription: … » des notes affichées. */
export function stripDateInscriptionFromNotes(notes?: string | null): string | undefined {
  const rest = notes?.replace(DATE_INSCRIPTION_NOTES_RE, "").trim();
  return rest || undefined;
}

/** Met à jour ou retire la ligne « Date inscription: … » en tête des notes. */
export function setDateInscriptionInNotes(
  notes: string | undefined,
  isoDate: string | undefined
): string | undefined {
  const rest = notes?.replace(DATE_INSCRIPTION_NOTES_RE, "").trim();
  if (!isoDate) return rest || undefined;
  const d = new Date(isoDate);
  if (Number.isNaN(d.getTime())) return rest || notes;
  const label = d.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "UTC",
  });
  const prefix = `Date inscription: ${label}`;
  return rest ? `${prefix}\n\n${rest}` : prefix;
}
