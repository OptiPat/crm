import {
  extractIdentityTextFromFile,
  extractIdentityTextFromRectoVersoFiles,
} from "@/lib/documents/extraction/extract-identity-text";
import {
  parseIdentityFromRegions,
  type IdentityExtractResult,
} from "@/lib/identity/parse-identity-document";

async function parseExtractedIdentity(
  extracted: Awaited<ReturnType<typeof extractIdentityTextFromFile>>
): Promise<
  IdentityExtractResult & {
    usedOcr: boolean;
    layout: IdentityExtractResult["layout"];
    documentKind: IdentityExtractResult["documentKind"];
  }
> {
  const parsed = parseIdentityFromRegions({
    rectoText: extracted.rectoText,
    versoText: extracted.versoText,
  });
  return {
    ...parsed,
    usedOcr: extracted.usedOcr,
    layout: extracted.layout,
    documentKind: extracted.documentKind,
  };
}

export async function extractIdentityFromFilePath(
  filePath: string
): Promise<
  IdentityExtractResult & {
    usedOcr: boolean;
    layout: IdentityExtractResult["layout"];
    documentKind: IdentityExtractResult["documentKind"];
  }
> {
  const extracted = await extractIdentityTextFromFile(filePath);
  return parseExtractedIdentity(extracted);
}

export async function extractIdentityFromRectoVersoFiles(
  rectoPath: string,
  versoPath: string
): Promise<
  IdentityExtractResult & {
    usedOcr: boolean;
    layout: IdentityExtractResult["layout"];
    documentKind: IdentityExtractResult["documentKind"];
  }
> {
  const extracted = await extractIdentityTextFromRectoVersoFiles(rectoPath, versoPath);
  return parseExtractedIdentity(extracted);
}
