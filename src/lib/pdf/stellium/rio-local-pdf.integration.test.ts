import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { parseAuto } from "../parse-auto";
import { isStelliumRio } from "./index";
import { extractPatrimoineItemsFromRio } from "@/lib/documents/extract-patrimoine-items";
import { ownerHintToKey } from "@/lib/documents/rio-couple-patrimoine-owner";
import {
  reconstructPageTextFromItems,
  type PdfTextItemLike,
} from "../pdf-layout";

const LOCAL_PDF = process.env.RIO_LOCAL_PDF?.trim();

function ensurePdfJsNodePolyfills(): void {
  if (!(globalThis as { DOMMatrix?: unknown }).DOMMatrix) {
    (globalThis as { DOMMatrix?: unknown }).DOMMatrix = class DOMMatrix {
      a = 1;
      b = 0;
      c = 0;
      d = 1;
      e = 0;
      f = 0;
      is2D = true;
      isIdentity = true;
    };
  }
}

async function extractTextFromLocalPdf(filePath: string): Promise<string> {
  ensurePdfJsNodePolyfills();
  const pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs");

  const buffer = fs.readFileSync(filePath);
  const loadingTask = pdfjsLib.getDocument({
    data: new Uint8Array(buffer),
    useWorkerFetch: false,
  });
  const pdf = await loadingTask.promise;
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

describe.skipIf(!LOCAL_PDF)("RIO local PDF (RIO_LOCAL_PDF)", () => {
  it("parse un RIO couple Stellium avec hints détenteur patrimoine", async () => {
    const pdfPath = path.resolve(LOCAL_PDF!);
    expect(fs.existsSync(pdfPath)).toBe(true);

    const text = await extractTextFromLocalPdf(pdfPath);
    expect(text.length).toBeGreaterThan(500);
    expect(isStelliumRio(text)).toBe(true);

    const data = parseAuto(text);
    expect(data.isCouple).toBe(true);
    expect(data.conjoint?.nom?.length).toBeGreaterThan(0);
    expect(data.conjoint?.prenom?.length).toBeGreaterThan(0);

    const items = extractPatrimoineItemsFromRio(data);
    expect(items.length).toBeGreaterThan(0);

    const withHint = items.filter((item) => item.rioOwnerHint != null);
    expect(withHint.length).toBe(items.length);

    const hintCounts = withHint.reduce(
      (acc, item) => {
        acc[item.rioOwnerHint!] = (acc[item.rioOwnerHint!] ?? 0) + 1;
        return acc;
      },
      {} as Record<string, number>
    );
    // Au moins une ligne par conjoint ou commun selon le layout PDF extrait.
    const distinctHints = Object.keys(hintCounts).length;
    expect(distinctHints).toBeGreaterThanOrEqual(1);
    expect((hintCounts.person1 ?? 0) + (hintCounts.person2 ?? 0) + (hintCounts.foyer ?? 0)).toBe(
      items.length
    );

    const memberIds: [number, number] = [1, 2];
    const ownerKeys = new Set(
      withHint.map((item) => ownerHintToKey(item.rioOwnerHint, memberIds))
    );
    expect(ownerKeys.size).toBeGreaterThan(0);
  });
});
