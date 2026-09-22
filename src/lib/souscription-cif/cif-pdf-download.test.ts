import { describe, expect, it } from "vitest";
import {
  a4SliceCount,
  CIF_PDF_PAGE_SELECTOR,
  listCifPdfPageElements,
  renderCifPortalPdf,
  replaceModernColorFunctions,
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

describe("replaceModernColorFunctions", () => {
  it("remplace le CSS Tailwind compilé, variables et color-mix en oklab", () => {
    const css = [
      "@theme { --color-amber-200: oklch(0.92 0.05 85); }",
      "@supports (color: color-mix(in lab, red, red)) {",
      ".bg { background: color-mix(in oklab, var(--border) 30%, transparent); }",
      "}",
    ].join(" ");
    const out = replaceModernColorFunctions(css, () => "#aabbcc");
    expect(out.includes("oklch")).toBe(false);
    expect(out.includes("color-mix")).toBe(false);
    expect(out.includes("#aabbcc")).toBe(true);
  });

  it("remplace oklch et color-mix imbriqués", () => {
    const css = "a{color:oklch(0.5 0.1 20)} b{background:color-mix(in oklch, oklch(0.2 0.1 10), white)}";
    const out = replaceModernColorFunctions(css, () => "#112233");
    expect(out).toBe("a{color:#112233} b{background:#112233}");
    expect(out.includes("oklch")).toBe(false);
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
