/** Normalise une image (EXIF orientation téléphone) → PNG data URL. */

function canvasToDataUrl(canvas: HTMLCanvasElement): string {
  return canvas.toDataURL("image/png");
}

async function bitmapFromBlob(blob: Blob): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(blob, { imageOrientation: "from-image" });
    } catch {
      // Fallback navigateur / webview sans option EXIF.
    }
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = dataUrl;
  });
}

export async function normalizeImageBlobToDataUrl(blob: Blob): Promise<string> {
  const source = await bitmapFromBlob(blob);
  const width = "width" in source ? source.width : (source as HTMLImageElement).naturalWidth;
  const height = "height" in source ? source.height : (source as HTMLImageElement).naturalHeight;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D indisponible");
  ctx.drawImage(source as CanvasImageSource, 0, 0);

  if ("close" in source && typeof source.close === "function") {
    source.close();
  }

  return canvasToDataUrl(canvas);
}

export function rotateDataUrl(dataUrl: string, degrees: 90 | 180 | 270): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const swap = degrees === 90 || degrees === 270;
      canvas.width = swap ? img.height : img.width;
      canvas.height = swap ? img.width : img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D indisponible"));
        return;
      }
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate((degrees * Math.PI) / 180);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      resolve(canvasToDataUrl(canvas));
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = dataUrl;
  });
}

export const ORIENTATION_PROBE_DEGREES = [90, 180, 270] as const;
