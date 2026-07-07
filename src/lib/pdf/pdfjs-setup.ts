/**
 * PDF.js — compatibilité Tauri / WebKit (macOS) : polyfills + build legacy.
 * pdfjs-dist 5.x utilise Promise.withResolvers, absent sur plusieurs WebKit.
 */
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";
import pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.min.mjs?url";

let configured = false;

function ensurePromiseWithResolvers(): void {
  if (typeof Promise.withResolvers === "function") return;

  Promise.withResolvers = function withResolvers<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((res, rej) => {
      resolve = res;
      reject = rej;
    });
    return { promise, resolve, reject };
  };
}

function ensureDomMatrix(): void {
  if (typeof globalThis.DOMMatrix !== "undefined") return;

  globalThis.DOMMatrix = class DOMMatrix {
    a = 1;
    b = 0;
    c = 0;
    d = 1;
    e = 0;
    f = 0;
    is2D = true;
    isIdentity = true;
  } as typeof DOMMatrix;
}

/** À appeler au démarrage (main.tsx) avant tout import PDF. */
export function ensurePdfJsEnvironment(): void {
  ensurePromiseWithResolvers();
  ensureDomMatrix();
}

function configurePdfJsOnce(): typeof pdfjsLib {
  ensurePdfJsEnvironment();
  if (!configured) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;
    configured = true;
  }
  return pdfjsLib;
}

export function loadPdfDocument(data: Uint8Array | ArrayBuffer) {
  const pdfjs = configurePdfJsOnce();
  const bytes = data instanceof Uint8Array ? data.slice() : new Uint8Array(data);

  return pdfjs.getDocument({
    data: bytes,
    useWorkerFetch: false,
    isEvalSupported: false,
  });
}
