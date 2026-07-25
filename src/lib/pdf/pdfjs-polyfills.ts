/**
 * Polyfills PDF.js — à charger avant tout import de pdfjs-dist.
 * WebKit macOS (Tauri) manque souvent Promise.withResolvers et DOMMatrix.
 */
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

/**
 * Clone récursif minimal (objets/tableaux/TypedArray/ArrayBuffer/Map/Set/Date/RegExp) —
 * suffisant pour les messages internes de pdf.js (LoopbackPort, cf. pdf.mjs).
 * Le "transfer" (options.transfer) n'est pas honoré : on reste dans la même
 * réalité JS (pas de vrai thread), donc une copie sans détachement est sûre.
 */
function structuredCloneFallback<T>(value: T): T {
  const seen = new WeakMap<object, unknown>();
  function clone(v: unknown): unknown {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return seen.get(v);
    if (v instanceof ArrayBuffer) return v.slice(0);
    if (ArrayBuffer.isView(v)) {
      const Ctor = v.constructor as new (
        buffer: ArrayBufferLike,
        byteOffset: number,
        length?: number
      ) => ArrayBufferView;
      const length =
        "length" in v
          ? (v as unknown as { length: number }).length
          : v.byteLength / ((v as unknown as { BYTES_PER_ELEMENT?: number }).BYTES_PER_ELEMENT ?? 1);
      return new Ctor(clone(v.buffer) as ArrayBufferLike, v.byteOffset, length);
    }
    if (v instanceof Date) return new Date(v.getTime());
    if (v instanceof RegExp) return new RegExp(v.source, v.flags);
    if (v instanceof Map) {
      const copy = new Map();
      seen.set(v, copy);
      for (const [k, val] of v) copy.set(clone(k), clone(val));
      return copy;
    }
    if (v instanceof Set) {
      const copy = new Set();
      seen.set(v, copy);
      for (const item of v) copy.add(clone(item));
      return copy;
    }
    if (Array.isArray(v)) {
      const copy: unknown[] = [];
      seen.set(v, copy);
      for (let i = 0; i < v.length; i++) copy[i] = clone(v[i]);
      return copy;
    }
    const copy: Record<string, unknown> = {};
    seen.set(v, copy);
    for (const key of Object.keys(v)) copy[key] = clone((v as Record<string, unknown>)[key]);
    return copy;
  }
  return clone(value) as T;
}

/**
 * WebKit peut exposer `structuredClone` sur `window` mais pas dans le contexte
 * "fake-worker" (`LoopbackPort`) que pdf.js utilise en repli quand le vrai
 * Worker échoue — ou l'API peut simplement être absente sur un WebKit ancien.
 * pdf.js l'appelle sans filet (pdf.mjs `LoopbackPort.postMessage`), d'où un
 * crash "undefined is not a function" reproductible sur les PDF Stellium.
 */
function ensureStructuredClone(): void {
  if (typeof globalThis.structuredClone === "function") return;
  globalThis.structuredClone = structuredCloneFallback;
}

/**
 * WebKit n'a ajouté l'itération asynchrone native des `ReadableStream`
 * (`Symbol.asyncIterator`) que dans Safari 16.4 (mars 2023). Sur un WebKit
 * plus ancien, `PDFPageProxy.getTextContent()` de pdf.js (qui fait
 * `for await (const value of readableStream)`) plante avec
 * "undefined is not a function" — confirmé via la stack trace macOS
 * (`getTextContent@.../pdf-*.js`) et reproduit sur des PDF Stellium réels.
 * Repli via `getReader()`, disponible sur tous les WebKit ciblés.
 */
function ensureReadableStreamAsyncIterator(): void {
  if (typeof globalThis.ReadableStream === "undefined") return;
  const proto = globalThis.ReadableStream.prototype as ReadableStream<unknown> & {
    [Symbol.asyncIterator]?: () => AsyncIterator<unknown>;
  };
  if (typeof proto[Symbol.asyncIterator] === "function") return;

  proto[Symbol.asyncIterator] = function (this: ReadableStream<unknown>) {
    const reader = this.getReader();
    return {
      async next() {
        return await reader.read();
      },
      async return(value?: unknown) {
        await reader.cancel();
        return { done: true as const, value };
      },
      [Symbol.asyncIterator]() {
        return this;
      },
    };
  };
}

/** Matrice 2D minimale — le rendu canvas PDF.js appelle multiply / inverse / transformPoint. */
class DomMatrixPolyfill {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  readonly is2D = true;
  isIdentity: boolean;

  constructor(init?: string | number[]) {
    this.a = 1;
    this.b = 0;
    this.c = 0;
    this.d = 1;
    this.e = 0;
    this.f = 0;
    this.isIdentity = true;

    if (Array.isArray(init) && init.length >= 6) {
      [this.a, this.b, this.c, this.d, this.e, this.f] = init;
      this.isIdentity =
        this.a === 1 &&
        this.b === 0 &&
        this.c === 0 &&
        this.d === 1 &&
        this.e === 0 &&
        this.f === 0;
    }
  }

  multiply(other: DomMatrixPolyfill): DomMatrixPolyfill {
    const result = new DomMatrixPolyfill();
    result.a = this.a * other.a + this.c * other.b;
    result.b = this.b * other.a + this.d * other.b;
    result.c = this.a * other.c + this.c * other.d;
    result.d = this.b * other.c + this.d * other.d;
    result.e = this.a * other.e + this.c * other.f + this.e;
    result.f = this.b * other.e + this.d * other.f + this.f;
    result.isIdentity = false;
    return result;
  }

  translate(tx: number, ty = 0): DomMatrixPolyfill {
    return this.multiply(new DomMatrixPolyfill([1, 0, 0, 1, tx, ty]));
  }

  scale(sx: number, sy = sx): DomMatrixPolyfill {
    return this.multiply(new DomMatrixPolyfill([sx, 0, 0, sy, 0, 0]));
  }

  inverse(): DomMatrixPolyfill {
    const det = this.a * this.d - this.b * this.c;
    if (det === 0) {
      throw new Error("DOMMatrix non inversible");
    }
    const result = new DomMatrixPolyfill();
    result.a = this.d / det;
    result.b = -this.b / det;
    result.c = -this.c / det;
    result.d = this.a / det;
    result.e = (this.c * this.f - this.d * this.e) / det;
    result.f = (this.b * this.e - this.a * this.f) / det;
    result.isIdentity = false;
    return result;
  }

  transformPoint(point?: { x: number; y: number }): { x: number; y: number; z: number; w: number } {
    const x = point?.x ?? 0;
    const y = point?.y ?? 0;
    return {
      x: this.a * x + this.c * y + this.e,
      y: this.b * x + this.d * y + this.f,
      z: 0,
      w: 1,
    };
  }
}

function domMatrixLooksComplete(): boolean {
  if (typeof globalThis.DOMMatrix === "undefined") return false;
  try {
    const matrix = new globalThis.DOMMatrix([1, 0, 0, 1, 0, 0]);
    return (
      typeof matrix.multiply === "function" &&
      typeof matrix.transformPoint === "function" &&
      typeof matrix.inverse === "function"
    );
  } catch {
    return false;
  }
}

function ensureDomMatrix(): void {
  if (domMatrixLooksComplete()) return;
  globalThis.DOMMatrix = DomMatrixPolyfill as unknown as typeof DOMMatrix;
}

/** Appliquer au démarrage (main.tsx) avant le premier chargement PDF. */
export function ensurePdfJsPolyfills(): void {
  ensurePromiseWithResolvers();
  ensureDomMatrix();
  ensureStructuredClone();
  ensureReadableStreamAsyncIterator();
}

/** Alias conservé pour les imports existants. */
export const ensurePdfJsEnvironment = ensurePdfJsPolyfills;
