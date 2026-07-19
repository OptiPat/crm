import { open } from "@tauri-apps/plugin-dialog";
import {
  localImageToDataUrl,
  readLocalImageFile,
} from "@/lib/api/tauri-secure-files";

const MAX_EMBED_BYTES = 800_000;

/** Ouvre un fichier image local et retourne une data URL embarquée pour l'email. */
export async function pickNewsletterImageDataUrl(): Promise<{
  dataUrl: string;
  tooLarge?: boolean;
} | null> {
  const selected = await open({
    multiple: false,
    filters: [
      {
        name: "Images",
        extensions: ["png", "jpg", "jpeg", "webp", "gif"],
      },
    ],
  });

  if (!selected || typeof selected !== "string") {
    return null;
  }

  const image = await readLocalImageFile(selected);
  if (image.bytes.byteLength > MAX_EMBED_BYTES) {
    return { dataUrl: "", tooLarge: true };
  }

  return { dataUrl: localImageToDataUrl(image.bytes, image.mime) };
}

export function newNewsletterImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
