export {
  extractIdentityTextFromFile as extractCniTextFromFile,
  isIdentityFilePath,
  terminateOcrWorker,
} from "@/lib/documents/extraction/extract-identity-text";

import { extractIdentityTextFromFile } from "@/lib/documents/extraction/extract-identity-text";

/** @deprecated Préférer extractIdentityTextFromFile + parseIdentityFromRegions */
export async function extractTextFromIdentityFile(filePath: string): Promise<{
  text: string;
  usedOcr: boolean;
}> {
  const result = await extractIdentityTextFromFile(filePath);
  return { text: result.text, usedOcr: result.usedOcr };
}

export type { IdentityExtractedText as CniExtractedText } from "@/lib/documents/extraction/types";
