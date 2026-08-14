import { useEffect, useState } from "react";
import {
  hasWhiteCanvasBackground,
  knockoutWhitePixels,
} from "@/lib/espace-client/knockout-white-logo";

/** Si le PNG a un fond blanc de canvas, le rend transparent. Sinon, l'URL d'origine. */
export function useKnockoutWhiteLogo(src: string | undefined): string | undefined {
  const [out, setOut] = useState<string | undefined>(src);

  useEffect(() => {
    if (!src) {
      setOut(undefined);
      return;
    }
    setOut(src);
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const raw = ctx.getImageData(0, 0, canvas.width, canvas.height);
        if (!hasWhiteCanvasBackground(raw)) return;
        const knocked = knockoutWhitePixels(raw);
        raw.data.set(knocked);
        ctx.putImageData(raw, 0, 0);
        const next = canvas.toDataURL("image/png");
        if (!cancelled) setOut(next);
      } catch {
        /* image interdite canvas (CORS) : on garde le fichier tel quel */
      }
    };
    img.src = src;
    return () => {
      cancelled = true;
    };
  }, [src]);

  return out;
}
