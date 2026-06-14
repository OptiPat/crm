import type { IdentityOcrRegionPlan } from "@/lib/documents/extraction/types";

export type CropRegion = NonNullable<IdentityOcrRegionPlan["region"]>;

export function cropCanvasRegion(
  source: HTMLCanvasElement | HTMLImageElement,
  region: CropRegion
): string {
  const width = source.width;
  const height = source.height;
  const leftRatio = region.leftRatio ?? 0;
  const widthRatio = region.widthRatio ?? 1;

  const left = Math.floor(width * leftRatio);
  const cropWidth = Math.floor(width * widthRatio);
  const top = Math.floor(height * region.topRatio);
  const cropHeight = Math.floor(height * region.heightRatio);

  const canvas = document.createElement("canvas");
  canvas.width = cropWidth;
  canvas.height = cropHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  ctx.drawImage(source, left, top, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return canvas.toDataURL("image/png");
}

export async function cropImageDataUrl(dataUrl: string, plan: IdentityOcrRegionPlan): Promise<string> {
  if (!plan.region) return dataUrl;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(cropCanvasRegion(img, plan.region!));
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = dataUrl;
  });
}
