/**
 * Outil de diagnostic RIO — usage local uniquement.
 *
 * Affiche, pour un PDF RIO donné :
 *  1. le TEXTE reconstruit exactement comme le parser le voit
 *     (pdf.js + reconstruction de colonnes `pdf-layout.ts`) ;
 *  2. le RÉSULTAT du parser Stellium (`parseAuto`).
 *
 * Ne committe JAMAIS de PDF client : déposer les fichiers dans `_rio_local/`
 * (dossier ignoré par git). Le script et sa sortie ne sont pas persistés en base.
 *
 * Usage :
 *   npx tsx scripts/dump-rio.mts _rio_local/mon-rio.pdf
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  reconstructPageTextFromItems,
  type PdfTextItemLike,
} from "../src/lib/pdf/pdf-layout.ts";
import { parseAuto } from "../src/lib/pdf/parse-auto.ts";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: npx tsx scripts/dump-rio.mts <chemin-vers-rio.pdf>");
  process.exit(1);
}

const path = resolve(fileArg);
const data = new Uint8Array(readFileSync(path));

const pdf = await getDocument({ data, useSystemFonts: true }).promise;

let fullText = "";
for (let p = 1; p <= pdf.numPages; p++) {
  const page = await pdf.getPage(p);
  const textContent = await page.getTextContent();
  const items = (textContent.items as unknown[]).filter(
    (item): item is PdfTextItemLike =>
      typeof item === "object" &&
      item != null &&
      "str" in item &&
      typeof (item as PdfTextItemLike).str === "string"
  );
  fullText += reconstructPageTextFromItems(items) + "\n\n";
}
fullText = fullText.trim();

console.log(
  "==================== TEXTE RECONSTRUIT (vu par le parser) ===================="
);
console.log(fullText);
console.log(
  "\n==================== RÉSULTAT DU PARSER (parseAuto) ===================="
);
console.log(JSON.stringify(parseAuto(fullText), null, 2));
