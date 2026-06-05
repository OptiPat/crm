import { getContactsMatchingSegment } from "@/lib/api/tauri-segments";
import { getAllFoyers } from "@/lib/api/tauri-foyers";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";
import {
  getAllContactEtiquettesDetails,
  type ContactEtiquetteDetails,
} from "@/lib/api/tauri-etiquettes";
import { groupEtiquettesByContactId } from "@/lib/etiquettes/etiquette-condition-labels";
import { buildPatrimoineMaps } from "@/lib/investissements/bulk-patrimoine";
import { buildContactsCsv } from "@/lib/export/contacts-csv";
import { downloadCsvFile } from "@/lib/export/csv-export";

/** Nom de fichier sûr (accents/espaces → ascii simple). */
export function slugifyForFilename(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .toLowerCase() || "segment"
  );
}

/**
 * Exporte les contacts d'un segment en CSV (UTF-8 + BOM, séparateur `;` →
 * s'ouvre directement dans Excel). Réutilise le format de l'export Contacts.
 * Retourne le nombre de contacts exportés.
 */
export async function exportSegmentToCsv(
  segmentId: number,
  segmentNom: string
): Promise<number> {
  const contacts = await getContactsMatchingSegment(segmentId);

  const [foyers, allInvestissements, etiquettesDetails] = await Promise.all([
    getAllFoyers(),
    getAllInvestissements(),
    contacts.length > 0
      ? getAllContactEtiquettesDetails()
      : Promise.resolve<ContactEtiquetteDetails[]>([]),
  ]);

  const maps = buildPatrimoineMaps(contacts, foyers, allInvestissements);
  const etiquettesParContact = groupEtiquettesByContactId(
    etiquettesDetails
  ) as Record<number, ContactEtiquetteDetails[]>;

  const csv = buildContactsCsv(
    contacts,
    foyers,
    maps.patrimoines,
    maps.patrimoinesAvecMoi,
    etiquettesParContact
  );

  const date = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`segment_${slugifyForFilename(segmentNom)}_${date}.csv`, csv);

  return contacts.length;
}
