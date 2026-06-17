import type { StelliumDocumentKind } from "./detect";

function lastMatchGroup1(text: string, pattern: RegExp): string | undefined {
  let last: string | undefined;
  pattern.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    if (match[1]) last = match[1];
  }
  return last;
}

/** Pied de page Stellium sur la dernière page uniquement (numéro N/N). */
function extractLastPageFooterDate(
  text: string,
  docLabel: "Recueil d'informations" | "Profil investisseur"
): string | undefined {
  const escaped = docLabel.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `${escaped}\\s+-\\s+.+?\\s+-\\s+(\\d{2}\\/\\d{2}\\/\\d{4})\\s+(\\d+)\\s*\\/\\s*(\\d+)`,
    "gi"
  );
  let lastOnFinalPage: string | undefined;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    const [, date, current, total] = match;
    if (current === total) {
      lastOnFinalPage = date;
    }
  }
  return lastOnFinalPage;
}

function extractRioSignatureDate(text: string): string | undefined {
  const fromBlock = lastMatchGroup1(
    text,
    /Date et signature des investisseurs(?: et du consultant)?[\s\S]{0,500}?Recueil d'informations\s+-\s+.+?\s+-\s+(\d{2}\/\d{2}\/\d{4})/gi
  );
  if (fromBlock) return fromBlock;
  return extractLastPageFooterDate(text, "Recueil d'informations");
}

function extractQpiSignatureDate(text: string): string | undefined {
  const fromBlock = lastMatchGroup1(
    text,
    /Date et signature des investisseurs\s*:?\s*Profil investisseur\s+-\s+.+?\s+-\s+(\d{2}\/\d{2}\/\d{4})/gi
  );
  if (fromBlock) return fromBlock;
  return extractLastPageFooterDate(text, "Profil investisseur");
}

/** Date de signature lue sur la dernière page du RIO / QPI Stellium. */
export function extractStelliumSignatureDate(
  normalizedText: string,
  kind: StelliumDocumentKind
): string | undefined {
  const tail = normalizedText.split(/\n{2,}/).slice(-2).join("\n\n");
  const extract =
    kind === "RIO" ? extractRioSignatureDate : extractQpiSignatureDate;

  return extract(tail) ?? extract(normalizedText);
}
