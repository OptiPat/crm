import { open } from "@tauri-apps/plugin-dialog";
import { readFile } from "@tauri-apps/plugin-fs";

const MAX_EMBED_BYTES = 800_000;

function mimeFromPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
  if (lower.endsWith(".gif")) return "image/gif";
  return "image/jpeg";
}

function bytesToDataUrl(bytes: Uint8Array, mime: string): string {
  let binary = "";
  const chunkSize = 8192;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

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

  const bytes = await readFile(selected);
  if (bytes.byteLength > MAX_EMBED_BYTES) {
    return { dataUrl: "", tooLarge: true };
  }

  return { dataUrl: bytesToDataUrl(bytes, mimeFromPath(selected)) };
}

export function newNewsletterImageId(): string {
  return `img-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}
