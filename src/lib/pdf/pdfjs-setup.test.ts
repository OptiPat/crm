import { describe, expect, it } from "vitest";
import { ensurePdfJsPolyfills } from "./pdfjs-polyfills";
import { loadPdfDocument } from "./pdfjs-setup";

describe("pdfjs-setup", () => {
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

  it("loadPdfDocument rejette un buffer vide sans crash JS", async () => {
    ensurePdfJsPolyfills();
    await expect(loadPdfDocument(new Uint8Array()).promise).rejects.toBeDefined();
  });
});
