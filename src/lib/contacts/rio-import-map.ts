import type { NewContact } from "@/lib/api/tauri-contacts";
import type { ExtractedData } from "@/lib/pdf";
import { parseFrenchDateToIso } from "@/lib/contacts/rio-couple-import";

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

/** Mappe les données extraites d'un RIO solo vers un NewContact. */
export function mapExtractedDataToContact(data: ExtractedData): NewContact {
  const contact: NewContact = {
    nom: data.nom || "",
    prenom: data.prenom || "",
    categorie: "SUSPECT_CLIENT",
    statut_suivi: "ACTIF",
  };

  if (data.civilite) {
    contact.civilite = CIVILITE_MAP[data.civilite.toUpperCase()] || "AUTRE";
  }
  if (data.email) contact.email = data.email;
  if (data.telephone) contact.telephone = data.telephone;
  if (data.adresse) contact.adresse = data.adresse;
  if (data.codePostal) contact.code_postal = data.codePostal;
  if (data.ville) contact.ville = data.ville;

  if (data.dateNaissance) {
    const iso = parseFrenchDateToIso(data.dateNaissance);
    if (iso) contact.date_naissance = iso;
  }
  if (data.profession) contact.profession = data.profession;

  if (data.situationFamiliale) {
    contact.situation_familiale =
      SITUATION_MAP[data.situationFamiliale.toUpperCase()] || "AUTRE";
  }

  return contact;
}
