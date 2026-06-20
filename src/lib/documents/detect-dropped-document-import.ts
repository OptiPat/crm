import type { ExtractedData } from "@/lib/pdf";
import { extractTextFromPDFPath, parseAuto } from "@/lib/pdf";
import {
  isLikelyIdentityFileName,
  looksLikeIdentityDocument,
} from "@/lib/identity";
import { isImageFile } from "@/hooks/useIdentityDocumentImport";

export type StagedDocumentFile = {
  path: string;
  name: string;
  size: number;
};

export type DroppedDocumentImportKind =
  | "stellium_rio"
  | "stellium_qpi"
  | "identity"
  | "generic";

export type DroppedDocumentImportPlan = {
  kind: DroppedDocumentImportKind;
  defaultTypeDocument: string;
  extractedData?: ExtractedData;
};

export async function detectDroppedDocumentImport(
  file: StagedDocumentFile
): Promise<DroppedDocumentImportPlan> {
  const lower = file.name.toLowerCase();

  if (isImageFile(file.name) || /\.(png|jpe?g|webp)$/i.test(lower)) {
    if (isLikelyIdentityFileName(file.name)) {
      return { kind: "identity", defaultTypeDocument: "IDENTITE" };
    }
    return { kind: "generic", defaultTypeDocument: "AUTRE" };
  }

  if (!lower.endsWith(".pdf")) {
    return { kind: "generic", defaultTypeDocument: "AUTRE" };
  }

  try {
    const result = await extractTextFromPDFPath(file.path);
    const text = result.text ?? "";

    if (looksLikeIdentityDocument(text) || isLikelyIdentityFileName(file.name)) {
      return { kind: "identity", defaultTypeDocument: "IDENTITE" };
    }

    const parsed = parseAuto(text);
    if (parsed.typeDocument === "QPI") {
      return {
        kind: "stellium_qpi",
        defaultTypeDocument: "QPI",
        extractedData: parsed,
      };
    }
    if (parsed.typeDocument === "RIO") {
      return {
        kind: "stellium_rio",
        defaultTypeDocument: "PATRIMOINE",
        extractedData: parsed,
      };
    }
  } catch (error) {
    console.error("detectDroppedDocumentImport:", error);
  }

  return { kind: "generic", defaultTypeDocument: "AUTRE" };
}

export function isStelliumDropKind(
  kind: DroppedDocumentImportKind
): kind is "stellium_rio" | "stellium_qpi" {
  return kind === "stellium_rio" || kind === "stellium_qpi";
}
