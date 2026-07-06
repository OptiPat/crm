import fs from "node:fs";
import path from "node:path";
import { parseAuto } from "../src/lib/pdf/parse-auto";
import { detectStelliumDocument, isStelliumQpi, isStelliumRio } from "../src/lib/pdf/stellium";
import { parseStelliumQpi } from "../src/lib/pdf/stellium/qpi-parser";
import { parseStelliumRio, findRioObjectifsTableBlock, parseRioObjectifsSection } from "../src/lib/pdf/stellium/rio-parser";
import { extractPatrimoineItemsFromRio } from "../src/lib/documents/extract-patrimoine-items";
import {
  reconstructPageTextFromItems,
  type PdfTextItemLike,
} from "../src/lib/pdf/pdf-layout";

function ensurePdfJsNodePolyfills(): void {
  if (!(globalThis as { DOMMatrix?: unknown }).DOMMatrix) {
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = class DOMMatrix {
      a = 1;
      is2D = true;
    };
  }
}

async function extractTextFromLocalPdf(filePath: string): Promise<string> {
  ensurePdfJsNodePolyfills();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const buffer = fs.readFileSync(path.resolve(filePath));
  const pdf = await pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
  }).promise;

  let fullText = "";
  for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const items = textContent.items.filter(
      (item): item is PdfTextItemLike =>
        typeof item === "object" &&
        item != null &&
        "str" in item &&
        typeof (item as PdfTextItemLike).str === "string"
    );
    fullText += reconstructPageTextFromItems(items) + "\n\n";
  }
  return fullText.trim();
}

function snippet(text: string, needle: RegExp, radius = 400): string | undefined {
  const m = text.match(needle);
  if (!m?.index && m?.index !== 0) return undefined;
  const start = Math.max(0, m.index - 80);
  return text.slice(start, m.index + radius).replace(/\s+/g, " ").trim();
}

async function diagnosePdf(filePath: string) {
  const text = await extractTextFromLocalPdf(filePath);
  const kind = detectStelliumDocument(text);
  const base = {
    file: path.basename(filePath),
    pages: text.split(/\n\n+/).length,
    textLength: text.length,
    kind,
    isQpi: isStelliumQpi(text),
    isRio: isStelliumRio(text),
  };

  if (kind === "QPI") {
    const data = parseStelliumQpi(text);
    return {
      ...base,
      qpi: {
        nom: data.nom,
        prenom: data.prenom,
        profilRisque: data.profilRisque,
        aversionRisque: data.aversionRisque,
        experienceInvestissement: data.experienceInvestissement,
        sensibiliteExtraFinanciere: data.sensibiliteExtraFinanciere?.slice(0, 120),
        dateDocument: data.dateDocument,
        dateSignature: data.dateSignature,
        confidence: data.confidence,
      },
      snippets: {
        profil: snippet(text, /profil de risque/i),
        tolerance: snippet(text, /Tolérance au risque/i),
        experience: snippet(text, /\bNovice\b/i, 200),
      },
    };
  }

  if (kind === "RIO") {
    const data = parseStelliumRio(text);
    const items = extractPatrimoineItemsFromRio(data);
    const hints = items.reduce(
      (acc, item) => {
        const h = item.rioOwnerHint ?? "none";
        acc[h] = (acc[h] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    const tableBlock = findRioObjectifsTableBlock(text);
    const objectifsFromBlock = tableBlock ? parseRioObjectifsSection(tableBlock) : [];

    return {
      ...base,
      rio: {
        isCouple: data.isCouple,
        nom: data.nom,
        prenom: data.prenom,
        conjointNom: data.conjoint?.nom,
        conjointPrenom: data.conjoint?.prenom,
        objectifsPrincipaux: data.objectifsPrincipaux,
        objectifsFromBlock,
        objectifsCount: data.objectifsPrincipaux?.length ?? 0,
        epargnePrecaution: data.epargnePrecautionSouhaitee,
        conjointEpargnePrecaution: data.conjoint?.epargnePrecautionSouhaitee,
        patrimoineItems: items.length,
        ownerHints: hints,
        confidence: data.confidence,
      },
      snippets: {
        objectifsHeader: snippet(text, /Objectif\(s\)/i),
        objectifsBlockStart: tableBlock?.slice(0, 350).replace(/\s+/g, " "),
      },
    };
  }

  const auto = parseAuto(text);
  return { ...base, autoType: auto.typeDocument };
}

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error("Usage: npx tsx scripts/diagnose-local-pdfs.ts <pdf> [...]");
  process.exit(1);
}

for (const file of files) {
  const report = await diagnosePdf(file);
  console.log(JSON.stringify(report, null, 2));
  console.log("---");
}
