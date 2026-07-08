export {
  pickNewsletterImageDataUrl as pickNoteImageDataUrl,
} from "@/lib/newsletter/newsletter-image-import";

/** Aligné sur newsletter-image-import (800 Ko). */
export const MAX_NOTE_IMAGE_EMBED_BYTES = 800_000;

export const NOTE_IMAGE_HTML_STYLE = "max-width:100%;height:auto;display:block";

export function buildNoteImageHtml(dataUrl: string, alt = "Image"): string {
  return `<img src="${dataUrl}" alt="${alt.replace(/"/g, "")}" style="${NOTE_IMAGE_HTML_STYLE}" />`;
}
