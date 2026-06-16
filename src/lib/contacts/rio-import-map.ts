import type { NewContact } from "@/lib/api/tauri-contacts";
import type { ExtractedData } from "@/lib/pdf";
import { buildSoloRioContactFields } from "@/lib/contacts/rio-contact-fields";

/** Mappe les données extraites d'un RIO solo vers un NewContact. */
export function mapExtractedDataToContact(data: ExtractedData): NewContact {
  const fields = buildSoloRioContactFields(data);
  return {
    nom: fields.nom || "",
    prenom: fields.prenom || "",
    categorie: fields.categorie || "SUSPECT_CLIENT",
    statut_suivi: fields.statut_suivi || "ACTIF",
    ...fields,
  };
}
