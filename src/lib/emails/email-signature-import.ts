import { open } from "@tauri-apps/plugin-dialog";
import {
  getOutlookSignaturesDirectory,
  importEmailSignatureFromFile,
  type ImportedGmailSignature,
} from "@/lib/api/tauri-email-oauth";

const IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "webp", "gif"];
const OUTLOOK_EXTENSIONS = ["htm", "html"];

/** Choisit une image (logo de signature Outlook enregistré sur le PC). */
export async function pickAndImportSignatureImage(): Promise<ImportedGmailSignature | null> {
  const selected = await open({
    multiple: false,
    title: "Choisir l'image de votre signature",
    filters: [{ name: "Images", extensions: IMAGE_EXTENSIONS }],
  });
  if (!selected || typeof selected !== "string") {
    return null;
  }
  return importEmailSignatureFromFile(selected);
}

/** Choisit un fichier Outlook `.htm` (dossier Signatures Windows). */
export async function pickAndImportOutlookSignatureFile(): Promise<ImportedGmailSignature | null> {
  const defaultPath = await getOutlookSignaturesDirectory();
  const selected = await open({
    multiple: false,
    title: "Choisir votre signature Outlook (.htm)",
    defaultPath: defaultPath ?? undefined,
    filters: [{ name: "Outlook", extensions: OUTLOOK_EXTENSIONS }],
  });
  if (!selected || typeof selected !== "string") {
    return null;
  }
  return importEmailSignatureFromFile(selected);
}
