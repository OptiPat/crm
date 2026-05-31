import type { Contact } from "@/lib/api/tauri-contacts";
import type { ContactEtiquetteDetails } from "@/lib/api/tauri-etiquettes";
import type { Foyer } from "@/lib/api/tauri-foyers";
import {
  getClientLabel,
  getFilleulLabel,
} from "@/lib/contacts/contact-form-utils";
import { rowsToCsv } from "@/lib/export/csv-export";

export function buildContactsCsv(
  contacts: Contact[],
  foyers: Foyer[],
  patrimoines: Record<string, number>,
  patrimoinesAvecMoi: Record<string, number>,
  etiquettesParContact: Record<number, ContactEtiquetteDetails[]>
): string {
  const foyerById = new Map(foyers.map((f) => [f.id, f.nom]));

  const headers = [
    "Prénom",
    "Nom",
    "Email",
    "Téléphone",
    "Catégorie",
    "Statut suivi",
    "Foyer",
    "Patrimoine total (€)",
    "Patrimoine avec moi (€)",
    "Étiquettes",
    "Ville",
    "Code postal",
  ];

  const rows = contacts.map((c) => {
    const etiqs = (etiquettesParContact[c.id!] ?? [])
      .map((e) => {
        const mode = e.attribue_par === "AUTO" ? "A" : "M";
        return `${e.etiquette_nom} (${mode})`;
      })
      .join(", ");

    return [
      c.prenom,
      c.nom,
      c.email ?? "",
      c.telephone ?? "",
      [getClientLabel(c.categorie), getFilleulLabel(c.filleul_categorie)]
        .filter(Boolean)
        .join(" · ") || c.categorie,
      c.statut_suivi,
      c.foyer_id != null ? foyerById.get(c.foyer_id) ?? String(c.foyer_id) : "",
      patrimoines[`contact_${c.id}`]?.toFixed(2) ?? "",
      patrimoinesAvecMoi[`contact_${c.id}`]?.toFixed(2) ?? "",
      etiqs,
      c.ville ?? "",
      c.code_postal ?? "",
    ];
  });

  return rowsToCsv(headers, rows);
}
