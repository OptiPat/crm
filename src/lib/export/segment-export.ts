import { getContactsMatchingSegment } from "@/lib/api/tauri-segments";
import { getAllFoyers } from "@/lib/api/tauri-foyers";
import { getAllInvestissements } from "@/lib/api/tauri-investissements";
import {
  getAllContactEtiquettesDetails,
  type ContactEtiquetteDetails,
} from "@/lib/api/tauri-etiquettes";
import { groupEtiquettesByContactId } from "@/lib/etiquettes/etiquette-condition-labels";
import { buildPatrimoineMaps } from "@/lib/investissements/bulk-patrimoine";
import { buildContactsCsv, type CustomFieldColumn } from "@/lib/export/contacts-csv";
import { downloadCsvFile } from "@/lib/export/csv-export";
import {
  getCustomFieldDefs,
  getAllContactCustomValues,
  type CustomFieldDef,
} from "@/lib/api/tauri-custom-fields";

/** Valeur stockée → texte lisible pour l'export (booléen, sinon brut). */
function formatCustomValueForExport(def: CustomFieldDef, raw: string | null): string {
  if (raw == null || raw === "") return "";
  if (def.field_type === "boolean") return raw === "true" ? "Oui" : "Non";
  return raw;
}

/** Construit une colonne d'export par champ perso actif (valeurs formatées par contact). */
async function buildCustomFieldColumns(): Promise<CustomFieldColumn[]> {
  const [defs, rows] = await Promise.all([
    getCustomFieldDefs(),
    getAllContactCustomValues(),
  ]);
  const activeDefs = defs.filter((d) => d.actif);
  if (activeDefs.length === 0) return [];

  const valuesByKey = new Map<string, Record<number, string | null>>();
  for (const row of rows) {
    let map = valuesByKey.get(row.field_key);
    if (!map) {
      map = {};
      valuesByKey.set(row.field_key, map);
    }
    map[row.entity_id] = row.value;
  }

  return activeDefs.map((def) => {
    const raw = valuesByKey.get(def.field_key) ?? {};
    const valuesByContact: Record<number, string> = {};
    for (const [id, value] of Object.entries(raw)) {
      valuesByContact[Number(id)] = formatCustomValueForExport(def, value);
    }
    return { key: def.field_key, label: def.label, valuesByContact };
  });
}

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

  const [foyers, allInvestissements, etiquettesDetails, customColumns] = await Promise.all([
    getAllFoyers(),
    getAllInvestissements(),
    contacts.length > 0
      ? getAllContactEtiquettesDetails()
      : Promise.resolve<ContactEtiquetteDetails[]>([]),
    contacts.length > 0
      ? buildCustomFieldColumns()
      : Promise.resolve<CustomFieldColumn[]>([]),
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
    etiquettesParContact,
    customColumns
  );

  const date = new Date().toISOString().slice(0, 10);
  downloadCsvFile(`segment_${slugifyForFilename(segmentNom)}_${date}.csv`, csv);

  return contacts.length;
}
