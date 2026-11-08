import { describe, expect, it } from "vitest";
import {
  a4SliceCount,
  CIF_PDF_PAGE_SELECTOR,
  listCifPdfPageElements,
  renderCifPortalPdf,
  replaceModernColorFunctions,
  rgbFromCssColor,
  cachedColorConverter,
  applyWebKitTextMetricsFix,
  isWebKitCapture,
  WEBKIT_TEXT_METRICS_STYLE_ID,
} from "@/lib/souscription-cif/cif-pdf-download";

/** Contexte 2D factice : `serialize` simule ce que le navigateur renvoie dans fillStyle. */
function fakeCtx(serialize: (value: string) => string, pixel: [number, number, number, number]) {
  let fill = "#000000";
  return {
    get fillStyle() {
      return fill;
    },
    set fillStyle(value: string) {
      fill = serialize(value);
    },
    clearRect: () => {},
    fillRect: () => {},
    getImageData: () => ({ data: Uint8ClampedArray.from(pixel) }) as unknown as ImageData,
  } as unknown as CanvasRenderingContext2D;
}

describe("rgbFromCssColor", () => {
  const neutral50 = "oklch(98.5% 0 0)";

  it("garde la couleur déjà convertie par Chromium (Windows)", () => {
    const ctx = fakeCtx((v) => (v === neutral50 ? "#fafafa" : v), [0, 0, 0, 255]);
    expect(rgbFromCssColor(neutral50, ctx)).toBe("#fafafa");
  });

  it("lit le pixel peint quand WebKit (Mac) garde oklch : jamais de fond noir", () => {
    const ctx = fakeCtx((v) => v, [250, 250, 250, 255]);
    expect(rgbFromCssColor(neutral50, ctx)).toBe("rgb(250, 250, 250)");
  });

  it("conserve la transparence et gère color(srgb …)", () => {
    const ctx = fakeCtx(() => "color(srgb 0.2 0.4 0.6 / 0.5)", [51, 102, 153, 128]);
    expect(rgbFromCssColor("color-mix(in oklab, red 50%, transparent)", ctx)).toBe(
      "rgba(51, 102, 153, 0.502)"
    );
  });
});

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

  it("garde le caractère qui précède et ignore les noms de propriétés", () => {
    const css = "color(srgb 1 0 0);a{border-color:red;fill:lab(50% 0 0)}";
    const out = replaceModernColorFunctions(css, () => "#000");
    expect(out).toBe("#000;a{border-color:red;fill:#000}");
  });
});

describe("compatibilité Safari < 16.4", () => {
  it("n'utilise pas d'assertion arrière dans les regex (écran blanc sur Mac anciens)", async () => {
    const { readFileSync } = await import("node:fs");
    const source = readFileSync("src/lib/souscription-cif/cif-pdf-download.ts", "utf8");
    expect(source.includes("(?<!")).toBe(false);
    expect(source.includes("(?<=")).toBe(false);
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

describe("capture Mac (WebKit) : espaces entre les mots", () => {
  const macTauri =
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)";
  const windowsWebView2 =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0";

  it("ne cible que WKWebView (Mac), pas WebView2 (Windows)", () => {
    expect(isWebKitCapture(macTauri)).toBe(true);
    expect(isWebKitCapture(`${macTauri} Safari/605.1.15`)).toBe(true);
    expect(isWebKitCapture(windowsWebView2)).toBe(false);
  });

  it("désactive crénage et ligatures dans la copie capturée, une seule fois", () => {
    type FakeStyle = { id: string; textContent: string; dataset: Record<string, string> };
    const appended: FakeStyle[] = [];
    const doc = {
      getElementById: (id: string) => appended.find((el) => el.id === id) ?? null,
      createElement: () => ({ id: "", textContent: "", dataset: {} }) as FakeStyle,
      head: { appendChild: (el: FakeStyle) => appended.push(el) },
    } as unknown as Document;
    applyWebKitTextMetricsFix(doc);
    applyWebKitTextMetricsFix(doc);
    expect(appended).toHaveLength(1);
    expect(appended[0]!.id).toBe(WEBKIT_TEXT_METRICS_STYLE_ID);
    expect(appended[0]!.textContent).toContain("font-kerning: none !important");
    expect(appended[0]!.textContent).toContain("font-variant-ligatures: none !important");
    expect(appended[0]!.dataset.cifColorSafe).toBe("true");
  });
});

describe("cachedColorConverter", () => {
  it("ne relit le pixel qu'une fois par couleur (Mac : téléchargement bloqué sinon)", () => {
    let reads = 0;
    const ctx = {
      fillStyle: "#000000",
      clearRect: () => {},
      fillRect: () => {},
      getImageData: () => {
        reads += 1;
        return { data: Uint8ClampedArray.from([250, 250, 250, 255]) } as unknown as ImageData;
      },
    };
    const doc = {
      createElement: () => ({ width: 0, height: 0, getContext: () => ctx }),
    } as unknown as Document;
    const toRgb = cachedColorConverter(doc);
    for (let i = 0; i < 5_000; i++) expect(toRgb("oklch(98.5% 0 0)")).toBe("rgb(250, 250, 250)");
    expect(toRgb("oklch(20% 0 0)")).toBe("rgb(250, 250, 250)");
    expect(reads).toBe(2);
  });
});
