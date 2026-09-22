import { describe, expect, it } from "vitest";
import {
  a4SliceCount,
  CIF_PDF_PAGE_SELECTOR,
  listCifPdfPageElements,
  renderCifPortalPdf,
} from "@/lib/souscription-cif/cif-pdf-download";

describe("listCifPdfPageElements", () => {
  it("cible les pages figées, Paged.js et le repli", () => {
    expect(CIF_PDF_PAGE_SELECTOR).toBe(".cif-print-page, .pagedjs_page, .cif-print-fallback");
    const pages = [{ id: "a" }, { id: "b" }];
    const root = {
      querySelectorAll: (selector: string) => (selector === CIF_PDF_PAGE_SELECTOR ? pages : []),
    };
    expect(listCifPdfPageElements(root as unknown as ParentNode)).toEqual(pages);
  });
});

describe("a4SliceCount", () => {
  it("garde une page A4 et découpe un flux plus long", () => {
    expect(a4SliceCount(210, 297)).toBe(1);
    expect(a4SliceCount(1000, Math.round(1000 * (297 / 210)))).toBe(1);
    expect(a4SliceCount(1000, Math.round(1000 * (297 / 210) * 2.5))).toBe(3);
  });
});
describe("renderCifPortalPdf", () => {
  it("refuse un portail sans page", async () => {
    const root = { querySelectorAll: () => [] };
    await expect(renderCifPortalPdf(root as unknown as HTMLElement)).rejects.toThrow(
      /Aucune page/
    );
  });
});
