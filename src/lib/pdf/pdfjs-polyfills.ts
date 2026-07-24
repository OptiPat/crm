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
}

/** Alias conservé pour les imports existants. */
export const ensurePdfJsEnvironment = ensurePdfJsPolyfills;
