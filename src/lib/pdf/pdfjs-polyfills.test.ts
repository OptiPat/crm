import { describe, expect, it } from "vitest";
import { ensurePdfJsPolyfills } from "./pdfjs-polyfills";

describe("pdfjs-polyfills", () => {
  it("polyfill Promise.withResolvers pour WebKit", async () => {
    const previous = Promise.withResolvers;
    // @ts-expect-error — simulation WebKit sans API moderne
    Promise.withResolvers = undefined;

    ensurePdfJsPolyfills();
    expect(typeof Promise.withResolvers).toBe("function");

    const { promise, resolve } = Promise.withResolvers<number>();
    resolve(42);
    await expect(promise).resolves.toBe(42);
    Promise.withResolvers = previous;
  });

  it("DOMMatrix polyfill supporte multiply et transformPoint", () => {
    const previous = globalThis.DOMMatrix;
    // @ts-expect-error — simulation WebKit sans DOMMatrix
    globalThis.DOMMatrix = undefined;

    ensurePdfJsPolyfills();
    const matrix = new globalThis.DOMMatrix([1, 0, 0, 1, 10, 20]);
    const point = matrix.transformPoint({ x: 5, y: 7 });
    expect(point.x).toBe(15);
    expect(point.y).toBe(27);

    const scaled = matrix.scale(2).transformPoint({ x: 1, y: 1 });
    expect(scaled.x).toBe(12);
    expect(scaled.y).toBe(22);

    globalThis.DOMMatrix = previous;
  });

  it("remplace un DOMMatrix incomplet (sans transformPoint)", () => {
    const previous = globalThis.DOMMatrix;
    globalThis.DOMMatrix = class IncompleteMatrix {
      constructor(_init?: number[]) {}
      multiply() {
        return this;
      }
    } as unknown as typeof DOMMatrix;

    ensurePdfJsPolyfills();
    const matrix = new globalThis.DOMMatrix([1, 0, 0, 1, 3, 4]);
    expect(typeof matrix.transformPoint).toBe("function");
    expect(matrix.transformPoint({ x: 1, y: 1 }).x).toBe(4);

    globalThis.DOMMatrix = previous;
  });

  it("polyfill structuredClone clone objets/tableaux/TypedArray/Map/Set imbriqués", () => {
    const previous = globalThis.structuredClone;
    // @ts-expect-error — simulation WebKit sans structuredClone (LoopbackPort pdf.js)
    globalThis.structuredClone = undefined;

    ensurePdfJsPolyfills();
    expect(typeof globalThis.structuredClone).toBe("function");

    const bytes = new Uint8Array([1, 2, 3]);
    const original = {
      bytes,
      list: [1, "a", { nested: true }],
      map: new Map([["k", 1]]),
      set: new Set([1, 2]),
    };
    const clone = globalThis.structuredClone(original);

    expect(clone).toEqual(original);
    expect(clone.bytes).not.toBe(bytes);
    expect(clone.bytes instanceof Uint8Array).toBe(true);
    expect(clone.map instanceof Map).toBe(true);
    expect(clone.set instanceof Set).toBe(true);

    globalThis.structuredClone = previous;
  });
});
