import { exists, readFile } from "@tauri-apps/plugin-fs";

function mimeFromLogoPath(path: string): string {
  const lower = path.toLowerCase();
  if (lower.endsWith(".png")) return "image/png";
  if (lower.endsWith(".webp")) return "image/webp";
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

/**
 * Charge le logo depuis le disque en data URL (fiable dans le webview Tauri,
 * sans dépendre du protocole asset de convertFileSrc).
 */
export async function loadCgpLogoDataUrl(
  logoPath: string | null | undefined
): Promise<string | null> {
  const path = logoPath?.trim();
  if (!path) return null;

  try {
    if (!(await exists(path))) return null;
    const bytes = await readFile(path);
    return bytesToDataUrl(bytes, mimeFromLogoPath(path));
  } catch (error) {
    console.error("Impossible de charger le logo:", error);
    return null;
  }
}
