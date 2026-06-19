/**
 * Extraction de l'adresse postale d'un RIO Stellium.
 *
 * Trois layouts rencontrés selon la reconstruction du PDF :
 *  1. Inline  : `Adresse postale   12 rue des Acacias  75001 Paris - France`
 *  2. Multi-lignes solo (la rue passe AVANT le libellé, le CP/ville APRÈS) :
 *       7 rue des Acacias
 *       Adresse postale
 *       75001 Paris - France
 *  3. Multi-lignes couple (colonnes séparées par tabulations) :
 *       8 place du Marché\t8 place du Marché
 *       Adresse postale
 *       69001 Lyon - France\t69001 Lyon - France
 */

export interface AdressePostaleParsed {
  adresse?: string;
  codePostal?: string;
  ville?: string;
}

/** Libellés de champ « Coordonnées » : une ligne qui commence ainsi n'est pas une rue. */
const FIELD_LABEL_START_RE =
  /^(Adresse|Téléphone|Autre|E-?mail|Coordonnées|Pays\b|Statut|Civilité|Nationalité|Mesure|Né\(e\)|Profession|Catégorie|Sous-catégorie|Régime|Situation|Origine|Nom\b|Date\b)/i;

function cleanVille(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function splitColumns(line: string): string[] {
  return line
    .split("\t")
    .map((col) => col.trim())
    .filter((col) => col.length > 0);
}

function parseCpVille(segment: string): { codePostal?: string; ville?: string } {
  const withCountry = segment.match(/(\d{5})\s+(.+?)\s*-\s*[A-Za-zÀ-ÿ' -]+\s*$/);
  if (withCountry) {
    return { codePostal: withCountry[1], ville: cleanVille(withCountry[2]) };
  }
  const cpOnly = segment.match(/(\d{5})\s+(.+?)\s*$/);
  if (cpOnly) {
    return { codePostal: cpOnly[1], ville: cleanVille(cpOnly[2]) };
  }
  const cp = segment.match(/(\d{5})/);
  return cp ? { codePostal: cp[1] } : {};
}

/** Layout inline : `<rue> <CP> <ville> - France` (éventuellement répété pour un couple). */
function parseInlineAddresses(text: string): AdressePostaleParsed[] {
  const re = /([^\t\n]+?)\s+(\d{5})\s+([A-Za-zÀ-ÿ0-9'’.\- ]+?)\s*-\s*France/gi;
  const out: AdressePostaleParsed[] = [];
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    out.push({
      adresse: match[1].trim(),
      codePostal: match[2],
      ville: cleanVille(match[3]),
    });
  }
  return out;
}

/**
 * Retourne les adresses postales de la section « Coordonnées ».
 * Une entrée par colonne (1 pour un solo, 2 pour un couple). Les entrées
 * peuvent être partielles (rue manquante mais CP/ville présents, ou inverse).
 */
export function parseAdressesPostales(coordonnees: string): AdressePostaleParsed[] {
  const lines = coordonnees.split(/\r?\n/);
  const labelIdx = lines.findIndex((line) => /Adresse postale/i.test(line));

  if (labelIdx >= 0) {
    const afterLabel = lines[labelIdx].replace(/^[\s\S]*?Adresse postale\s*:?/i, "");

    if (/\d{5}/.test(afterLabel)) {
      const inline = parseInlineAddresses(afterLabel);
      if (inline.length > 0) return inline;
    }

    let cpVilleLine = "";
    for (let i = labelIdx + 1; i < Math.min(lines.length, labelIdx + 4); i++) {
      if (/\d{5}/.test(lines[i])) {
        cpVilleLine = lines[i];
        break;
      }
    }
    const cpVilleCols = cpVilleLine ? splitColumns(cpVilleLine) : [];

    const prev = lines[labelIdx - 1] ?? "";
    const prevIsStreet =
      prev.trim().length > 0 &&
      !/\d{5}/.test(prev) &&
      !FIELD_LABEL_START_RE.test(prev.trim()) &&
      /[A-Za-zÀ-ÿ]/.test(prev);
    const streetCols = prevIsStreet ? splitColumns(prev) : [];

    const count = Math.max(cpVilleCols.length, streetCols.length);
    const result: AdressePostaleParsed[] = [];
    for (let c = 0; c < count; c++) {
      const entry: AdressePostaleParsed = cpVilleCols[c]
        ? parseCpVille(cpVilleCols[c])
        : {};
      if (streetCols[c]) entry.adresse = streetCols[c];
      if (entry.adresse || entry.codePostal || entry.ville) result.push(entry);
    }
    if (result.length > 0) return result;
  }

  return parseInlineAddresses(coordonnees);
}
