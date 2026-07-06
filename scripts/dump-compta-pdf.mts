/**
 * Diagnostic local — texte PDF factures compta (ne pas committer de PDF client).
 * Usage: npx tsx scripts/dump-compta-pdf.mts <fichier.pdf> [fichier2.pdf]
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  reconstructPageTextFromItems,
  type PdfTextItemLike,
} from "../src/lib/pdf/pdf-layout.ts";
import { extractComptaDepenseFromText } from "../src/lib/compta/compta-depense-extract.ts";
import { extractComptaInvoiceFromText } from "../src/lib/compta/compta-invoice-extract.ts";

async function extractText(path: string): Promise<string> {
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
  return fullText;
}

const files = process.argv.slice(2);
if (!files.length) {
  console.error("Usage: npx tsx scripts/dump-compta-pdf.mts <fichier.pdf>");
  process.exit(1);
}

for (const fileArg of files) {
  const path = resolve(fileArg);
  const text = await extractText(path);
  const base = path.split(/[/\\]/).pop() ?? path;
  console.log(`\n=== ${base} ===\n`);
  console.log(text);
  console.log("\n--- extraction encaissement ---");
  console.log(JSON.stringify(extractComptaInvoiceFromText(text, base), null, 2));
  console.log("\n--- extraction depense ---");
  console.log(JSON.stringify(extractComptaDepenseFromText(text, base), null, 2));
}
