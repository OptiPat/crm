// API pour lire les fichiers PDF via Tauri
import { invoke } from "@tauri-apps/api/core";

/**
 * Lit un fichier PDF depuis le disque et retourne son contenu en bytes
 * @param filePath Chemin complet du fichier PDF
 * @returns Contenu du fichier en Uint8Array
 */
export async function readPdfFile(filePath: string): Promise<Uint8Array> {
  const bytes: number[] = await invoke("read_pdf_file", { filePath });
  return new Uint8Array(bytes);
}
