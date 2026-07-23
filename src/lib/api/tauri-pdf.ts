// API pour lire les fichiers PDF via Tauri
import { invoke } from "@tauri-apps/api/core";

function toUint8Array(bytes: number[] | ArrayLike<number> | ArrayBuffer | Uint8Array): Uint8Array {
  if (bytes instanceof Uint8Array) return bytes;
  if (bytes instanceof ArrayBuffer) return new Uint8Array(bytes);
  return Uint8Array.from(bytes);
}

/**
 * Lit un fichier PDF depuis le disque et retourne son contenu en bytes
 * @param filePath Chemin complet du fichier PDF
 * @returns Contenu du fichier en Uint8Array
 */
export async function readPdfFile(filePath: string): Promise<Uint8Array> {
  const bytes = await invoke<number[] | ArrayLike<number> | ArrayBuffer | Uint8Array>(
    "read_pdf_file",
    { filePath }
  );
  return toUint8Array(bytes);
}
