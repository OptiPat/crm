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
});
