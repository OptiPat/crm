import { describe, expect, it } from "vitest";
import {
  buildCifPdfFilename,
  buildCifPdfFilenameStem,
  sanitizeFilenamePart,
} from "@/lib/souscription-cif/cif-pdf-filename";
import {
  buildCifPrintBundle,
  CIF_PRINT_DOCUMENT_ORDER,
  CIF_PRINT_DOCUMENT_ORDER_G3F,
  getCifPrintDocumentOrder,
} from "@/lib/souscription-cif/cif-print-export";
import type { ScpiLettreMissionPreview } from "@/lib/souscription-cif/render-template";

function emptyPreview(): ScpiLettreMissionPreview {
  return { pages: [], missingKeys: [] };
}

const LABELS = {
  "lettre-mission": "Lettre de mission",
  "convention-rto": "Convention RTO",
  "rapport-mission": "Rapport de mission",
  "annexes-rapport": "Annexes",
} as const;

describe("buildCifPdfFilename", () => {
  it("combine libellé document et nom client", () => {
    expect(buildCifPdfFilenameStem("Lettre de mission", "Jean Dupont")).toBe(
      "Lettre de mission - Jean Dupont"
    );
    expect(buildCifPdfFilename("Lettre de mission", "Jean Dupont")).toBe(
      "Lettre de mission - Jean Dupont.pdf"
    );
  });

  it("neutralise les caractères interdits sous Windows", () => {
    expect(sanitizeFilenamePart("Doc/A")).toBe("Doc-A");
    expect(buildCifPdfFilename("Doc/A", "Jean:Dupont")).toBe("Doc-A - Jean-Dupont.pdf");
  });
});

describe("buildCifPrintBundle", () => {
  it("retourne les 4 documents dans l'ordre métier par défaut", () => {
    const previews = {
      "lettre-mission": emptyPreview(),
      "convention-rto": emptyPreview(),
      "rapport-mission": emptyPreview(),
      "annexes-rapport": emptyPreview(),
    };

    const bundle = buildCifPrintBundle(previews, LABELS);

    expect(bundle.map((d) => d.id)).toEqual([...CIF_PRINT_DOCUMENT_ORDER]);
    expect(bundle[0]?.label).toBe("Lettre de mission");
  });

  it("accepte une liste partielle pour un seul document", () => {
    const previews = {
      "lettre-mission": emptyPreview(),
      "convention-rto": emptyPreview(),
      "rapport-mission": emptyPreview(),
      "annexes-rapport": emptyPreview(),
    };

    const bundle = buildCifPrintBundle(previews, LABELS, ["convention-rto"]);

    expect(bundle).toHaveLength(1);
    expect(bundle[0]?.id).toBe("convention-rto");
  });
});

describe("getCifPrintDocumentOrder", () => {
  it("exclut la convention RTO pour G3F", () => {
    expect(getCifPrintDocumentOrder("g3f")).toEqual([...CIF_PRINT_DOCUMENT_ORDER_G3F]);
    expect(getCifPrintDocumentOrder("scpi")).toEqual([...CIF_PRINT_DOCUMENT_ORDER]);
  });
});
