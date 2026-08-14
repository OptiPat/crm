/** Seuil d'un pixel « fond blanc » (export PNG sans transparence). */
const WHITE_MIN = 248;
const SOFT_MIN = 232;

export interface RgbaBuffer {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

function isNearWhite(r: number, g: number, b: number, min: number): boolean {
  return r >= min && g >= min && b >= min && Math.max(r, g, b) - Math.min(r, g, b) < 14;
}

function cornerOffset(buf: RgbaBuffer, x: number, y: number): number {
  return (y * buf.width + x) * 4;
}

/** Quatre coins blancs = fond de canvas, pas un monogramme blanc. */
export function hasWhiteCanvasBackground(buf: RgbaBuffer): boolean {
  if (buf.width < 2 || buf.height < 2) return false;
  const d = buf.data;
  const corners = [
    cornerOffset(buf, 0, 0),
    cornerOffset(buf, buf.width - 1, 0),
    cornerOffset(buf, 0, buf.height - 1),
    cornerOffset(buf, buf.width - 1, buf.height - 1),
  ];
  return corners.every((i) => isNearWhite(d[i], d[i + 1], d[i + 2], WHITE_MIN));
}

export function knockoutWhitePixels(buf: RgbaBuffer): Uint8ClampedArray {
  const px = new Uint8ClampedArray(buf.data);
  for (let i = 0; i < px.length; i += 4) {
    const r = px[i];
    const g = px[i + 1];
    const b = px[i + 2];
    if (isNearWhite(r, g, b, WHITE_MIN)) {
      px[i + 3] = 0;
      continue;
    }
    if (isNearWhite(r, g, b, SOFT_MIN)) {
      const darkness = WHITE_MIN - Math.min(r, g, b);
      px[i + 3] = Math.round((darkness / (WHITE_MIN - SOFT_MIN)) * px[i + 3]);
    }
  }
  return px;
}
