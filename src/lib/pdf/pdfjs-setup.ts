/**
 * PDF.js — compatibilité Tauri / WebKit (macOS).
 * Worker statique classic .js (public/pdfjs) — WKWebView rejette souvent les modules workers.
 * Préchargement du worker sur le thread principal = filet fake-worker si Worker échoue.
 */
import { ensurePdfJsPolyfills } from "./pdfjs-polyfills";

type PdfJsModule = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfjsLibPromise: Promise<PdfJsModule> | null = null;
let configured = false;

const PDFJS_ASSET_BASE = `${import.meta.env.BASE_URL}pdfjs/`;

/** Worker servi depuis public/pdfjs/ (dev Vite + prod Tauri). */
function resolvePdfWorkerSrc(): string {
  return `${PDFJS_ASSET_BASE}pdf.worker.min.js`;
}

function documentInitOptions(bytes: Uint8Array) {
  return {
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
    standardFontDataUrl: `${PDFJS_ASSET_BASE}standard_fonts/`,
    cMapUrl: `${PDFJS_ASSET_BASE}cmaps/`,
    wasmUrl: `${PDFJS_ASSET_BASE}wasm/`,
  };
}

/**
 * Enregistre WorkerMessageHandler sur globalThis (fake-worker) si le
 * Worker dédié ne démarre pas sous WKWebView.
 */
async function ensureFakeWorkerFallback(): Promise<void> {
  const g = globalThis as typeof globalThis & {
    pdfjsWorker?: { WorkerMessageHandler?: unknown };
  };
  if (g.pdfjsWorker?.WorkerMessageHandler) return;
  try {
    await import("pdfjs-dist/legacy/build/pdf.worker.min.mjs");
  } catch (error) {
    console.warn("PDF.js: préchargement fake-worker impossible", error);
  }
}

async function getPdfJsLib(): Promise<PdfJsModule> {
  ensurePdfJsPolyfills();
  if (!pdfjsLibPromise) {
    pdfjsLibPromise = (async () => {
      const [pdfjs] = await Promise.all([
        import("pdfjs-dist/legacy/build/pdf.mjs"),
        ensureFakeWorkerFallback(),
      ]);
      return pdfjs;
    })();
  }
  return pdfjsLibPromise;
}

function configurePdfJsOnce(pdfjs: PdfJsModule): void {
  if (configured) return;
  pdfjs.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc();
  configured = true;
}

function normalizePdfBytes(data: Uint8Array | ArrayBuffer): Uint8Array {
  if (data instanceof Uint8Array) return data.slice();
  return new Uint8Array(data);
}

export function loadPdfDocument(data: Uint8Array | ArrayBuffer) {
  const bytes = normalizePdfBytes(data);
  const promise = (async () => {
    const pdfjs = await getPdfJsLib();
    configurePdfJsOnce(pdfjs);
    return pdfjs.getDocument(documentInitOptions(bytes)).promise;
  })();
  return { promise };
}

export { ensurePdfJsPolyfills, ensurePdfJsEnvironment } from "./pdfjs-polyfills";
