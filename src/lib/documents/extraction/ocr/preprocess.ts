/** Pré-traitement image pour améliorer la lecture MRZ (local, canvas). */

function enhanceGrayscalePixels(data: Uint8ClampedArray): void {
  for (let i = 0; i < data.length; i += 4) {
    const gray = 0.299 * data[i]! + 0.587 * data[i + 1]! + 0.114 * data[i + 2]!;
    const contrast = Math.min(255, Math.max(0, (gray - 128) * 1.35 + 128));
    const binary = contrast >= 145 ? 255 : contrast <= 95 ? 0 : contrast;
    data[i] = binary;
    data[i + 1] = binary;
    data[i + 2] = binary;
  }
}

export function preprocessImageDataUrl(dataUrl: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Canvas 2D indisponible"));
        return;
      }
      ctx.drawImage(img, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      enhanceGrayscalePixels(imageData.data);
      ctx.putImageData(imageData, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = () => reject(new Error("Image illisible"));
    img.src = dataUrl;
  });
}
