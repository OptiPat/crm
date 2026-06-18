import type { Document } from "@/lib/api/tauri-documents";

/** Niveaux d'expérience QPI (Stellium / réglementaire). */
export const QPI_EXPERIENCE_LEVELS = ["Novice", "Informé", "Expérimenté"] as const;

/** Dernier QPI importé avec niveau d'expérience (Novice, Informé, Expérimenté). */
export function latestQpiExperienceInvestissement(
  documents: readonly Document[]
): string | null {
  let best: Document | undefined;
  for (const doc of documents) {
    if (doc.type_document !== "QPI") continue;
    const level = doc.experience_investissement?.trim();
    if (!level) continue;
    if (!best || doc.created_at > best.created_at) best = doc;
  }
  return best?.experience_investissement?.trim() ?? null;
}
