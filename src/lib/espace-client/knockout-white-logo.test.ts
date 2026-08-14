import { describe, expect, it } from "vitest";
import {
  hasWhiteCanvasBackground,
  knockoutWhitePixels,
} from "./knockout-white-logo";

function buffer(
  width: number,
  height: number,
  pixels: Array<[number, number, number, number]>
) {
  const data = new Uint8ClampedArray(width * height * 4);
  pixels.forEach((px, i) => data.set(px, i * 4));
  return { width, height, data };
}

describe("knockout-white-logo", () => {
  it("détecte un fond blanc aux quatre coins", () => {
    const w: [number, number, number, number] = [255, 255, 255, 255];
    const m: [number, number, number, number] = [180, 140, 60, 255];
    expect(hasWhiteCanvasBackground(buffer(3, 2, [w, w, w, w, m, w]))).toBe(
      true
    );
    expect(hasWhiteCanvasBackground(buffer(2, 2, [m, w, w, w]))).toBe(false);
  });

  it("rend le blanc transparent et garde la marque", () => {
    const out = knockoutWhitePixels(
      buffer(2, 1, [
        [255, 255, 255, 255],
        [40, 80, 140, 255],
      ])
    );
    expect(out[3]).toBe(0);
    expect(Array.from(out.slice(4, 8))).toEqual([40, 80, 140, 255]);
  });
});
