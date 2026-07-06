import type { ComptaCategory } from "@/lib/compta/compta-constants";
import { COMPTA_CATEGORIES } from "@/lib/compta/compta-constants";
import {
  extractComptaDateFromText,
  findLabeledAmount,
  normalizeComptaPdfText,
  parseDecimalAmount,
  parseFrenchAmount,
} from "@/lib/compta/compta-pdf-parse";
import { computeDepenseHt, roundComptaMoney } from "@/lib/compta/compta-money";

export interface ComptaDepenseExtraction {
  tiers: string;
  date: string;
  ttc: number;
  tva: number;
  ht: number;
  suggestedCategorie: ComptaCategory | "";
  confidence: "low" | "medium" | "high";
  /** Relevé bancaire : pas de facture, pas d’auto-tiers. */
  documentKind: "invoice" | "bank_statement";
  /** Devise détectée dans le PDF (montants bruts, pas de conversion). */
  currency: "EUR" | "USD";
}

function dateFromReleveFileName(fileName: string): string | null {
  const match = fileName.match(/(20\d{2})(\d{2})(\d{2})/);
  if (!match) return null;
  return `${match[1]}-${match[2]}-${match[3]}`;
}

/** Relevé CCP / extrait — pas une facture fournisseur. */
export function isComptaBankStatementPdf(text: string, fileName: string): boolean {
  if (/^releve[_-]/i.test(fileName.replace(/\.pdf$/i, ""))) return true;
  if (/^extrait[_-]compte/i.test(fileName.replace(/\.pdf$/i, ""))) return true;

  const blob = text.toLowerCase();
  const hits = [
    /relev[ée]\s*(?:de\s*)?compte/,
    /extrait\s*de\s*compte/,
    /la banque postale/,
    /\bccp\s*\d/,
    /solde\s+(?:au|cr[ée]diteur|d[ée]biteur)/,
    /(?:^|\n)\s*date\s+valeur\s+libell[ée]/,
    /(?:^|\n)\s*d[ée]bit\s+cr[ée]dit/,
  ];
  return hits.filter((re) => re.test(blob)).length >= 2;
}

function extractBankStatement(
  text: string,
  fileName: string
): ComptaDepenseExtraction {
  return {
    tiers: "",
    date: dateFromReleveFileName(fileName) ?? extractComptaDateFromText(text, fileName),
    ttc: 0,
    tva: 0,
    ht: 0,
    suggestedCategorie: "Relevé de compte",
    confidence: "low",
    documentKind: "bank_statement",
    currency: "EUR",
  };
}

function isOwnParty(line: string): boolean {
  return /^(Nicolas|N\.?\s*)?PLAZA\b/i.test(line.trim());
}

function cleanTiers(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

/** Première colonne / nom émetteur sans le client sur la même ligne. */
function firstPartyColumn(value: string): string {
  let v = value.trim();
  if (v.includes("\t")) v = v.split("\t")[0]!.trim();
  v = v.split(/\s+(?=Client\s*:)/i)[0]!.trim();
  v = v.split(/\s+(?=PLAZA\b)/i)[0]!.trim();
  return cleanTiers(v);
}

function tiersFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "").trim();
  const factureMatch = base.match(/facture\s+(.+)/i);
  if (factureMatch?.[1]) {
    return cleanTiers(factureMatch[1].replace(/[-_]+/g, " "));
  }
  if (/^clevercloud-invoice/i.test(base)) return "Clever Cloud";
  if (/^github-/i.test(base)) return "GitHub";
  if (/^sonar$/i.test(base)) return "SonarSource";
  return cleanTiers(base.replace(/^20\d{2}[-_]\d{2}[-_]\d{2}[-_\s]*/i, "").replace(/[-_]+/g, " "));
}

function extractDepenseTiers(text: string, fileName: string): string {
  if (isComptaBankStatementPdf(text, fileName)) return "";

  const looksLikeInvoice =
    /facture|invoice|total\s+ttc|net\s+[àa]\s+payer|amount due|justificatif|receipt|developer plan/i.test(
      text
    );

  if (/clever\s*cloud/i.test(text) && looksLikeInvoice) return "Clever Cloud";
  if (/cursor\.com|anysphere|\bcursor\b/i.test(text) && looksLikeInvoice) return "Cursor";
  if (/google\s*workspace|google cloud/i.test(text) && looksLikeInvoice) return "Google Workspace";
  if ((/github/i.test(text) || /github/i.test(fileName)) && looksLikeInvoice) {
    return "GitHub";
  }
  if (/sonar(?:cloud|source)?/i.test(text) && looksLikeInvoice) return "SonarSource";

  const orgSameLine = text.match(/Organisateur\s*:\s*([A-ZÀ-Ö0-9][^\n\t:]{2,})/i);
  if (orgSameLine?.[1] && !/^client/i.test(orgSameLine[1].trim())) {
    return firstPartyColumn(orgSameLine[1]);
  }

  const orgNextLine = text.match(/Organisateur\s*:[^\n]*\n\s*([^\n]+)/i);
  if (orgNextLine?.[1]) {
    for (const col of orgNextLine[1].split("\t").map((c) => c.trim()).filter(Boolean)) {
      if (/^client\s*:?/i.test(col)) continue;
      const name = firstPartyColumn(col);
      if (name.length >= 2 && !isOwnParty(name)) return name;
    }
    const fallback = firstPartyColumn(orgNextLine[1]);
    if (fallback.length >= 2 && !isOwnParty(fallback)) return fallback;
  }

  const factureBlock = text.match(/FACTURE[\s\S]{0,500}/i)?.[0] ?? text.slice(0, 500);
  for (const rawLine of factureBlock.split("\n")) {
    const line = rawLine.trim();
    if (line.length < 3 || line.length > 50) continue;
    if (/^(FACTURE|N[°o]|Date|Comptant|Montant|[ÉE]mis|FRANCE|Informations)/i.test(line)) {
      continue;
    }
    if (/^\d/.test(line)) continue;
    if (isOwnParty(line)) continue;
    if (/^(Adresse|Nicolas|TVA Intracom|Client\s*:)/i.test(line)) continue;
    if (/^[A-ZÀ-Ö0-9][A-ZÀ-Ö0-9 '&.-]+$/.test(line)) {
      return cleanTiers(line);
    }
  }

  const footer = text.match(
    /([A-Za-z0-9 .&'-]{3,60}?)\s+(?:SAS|SASU|SARL|SA|EURL)\b/i
  );
  if (footer?.[1]) {
    const chunk = footer[1].trim();
    const lastPart = chunk.split(/\s*-\s*/).pop()?.trim() ?? chunk;
    if (
      !isOwnParty(lastPart) &&
      !/total|tva|sous-total|en eur|factur/i.test(lastPart) &&
      lastPart.length <= 40
    ) {
      return cleanTiers(lastPart);
    }
  }

  const fromFile = tiersFromFileName(fileName);
  if (fromFile.length >= 2) return fromFile;

  return cleanTiers(fileName.replace(/\.pdf$/i, ""));
}

function extractFrenchAmounts(text: string): { ht: number; tva: number; ttc: number } {
  const htRaw = findLabeledAmount(text, [
    /Sous-total\s+HT\s+([\d\s]+[,.]\d{2})/i,
    /Total\s+HT\s*:?\s*([\d\s]+[,.]\d{2})/i,
    /TOTAL\s+HT\s*[:\s]+([\d\s]+[,.]\d{2})/i,
    /Subtotal\s+€?\s*([\d\s]+[,.]\d{2})/i,
  ]);

  const tvaRaw = findLabeledAmount(text, [
    /Total\s+TVA\s*(?:\([^)]+\))?\s*:?\s*([\d\s]+[,.]\d{2})/i,
    /TVA\s*\(\s*20\s*%\s*\)\s+([\d\s]+[,.]\d{2})/i,
    /Taux normal[^\n]*\t([\d\s]+[,.]\d{2})/i,
    /TOTAL\s+TVA\s*[:\s]+([\d\s]+[,.]\d{2})/i,
  ]);

  const ttcRaw = findLabeledAmount(text, [
    /NET\s+[ÀA]\s+PAYER\s+TTC\s+([\d\s]+[,.]\d{2})/i,
    /Total\s+TTC\s*:?\s*([\d\s]+[,.]\d{2})/i,
    /TOTAL\s+TTC\s*[:\s]+([\d\s]+[,.]\d{2})/i,
    /Montant\s+[àa]\s+payer\s*:?\s*([\d\s]+[,.]\d{2})/i,
    /Amount due\s+€?\s*([\d\s]+[,.]\d{2})/i,
    /Total\s+€?\s*([\d\s]+[,.]\d{2})/i,
  ]);

  let ht = htRaw ?? 0;
  let tva = tvaRaw ?? 0;
  let ttc = ttcRaw ?? 0;

  if (ttc > 0 && ht > 0 && tva === 0) {
    tva = roundComptaMoney(Math.max(0, ttc - ht));
  } else if (ttc > 0 && ht === 0 && tva === 0) {
    ht = computeDepenseHt(ttc, 0);
  } else if (ht > 0 && tva > 0 && ttc === 0) {
    ttc = roundComptaMoney(ht + tva);
  }

  return { ht, tva, ttc };
}

function extractGoogleWorkspaceAmounts(
  text: string
): { ht: number; tva: number; ttc: number } | null {
  if (!/google\s*(?:workspace|cloud)/i.test(text) || !/Sous-total en EUR/i.test(text)) {
    return null;
  }

  const triplet = text.match(
    /(\d{1,4},\d{2})\s*€\s+(\d{1,4},\d{2})\s*€\s+(\d{1,4},\d{2})\s*€\s+Sous-total en EUR/i
  );
  if (triplet) {
    const ht = parseFrenchAmount(triplet[1]!);
    const tva = parseFrenchAmount(triplet[2]!);
    const ttc = parseFrenchAmount(triplet[3]!);
    if (ht != null && tva != null && ttc != null) {
      return { ht, tva, ttc };
    }
  }

  const ht = findLabeledAmount(text, [/Sous-total en EUR[^\d]{0,40}(\d{1,4},\d{2})/i]);
  const tva = findLabeledAmount(text, [/TVA\s*\(\s*20\s*%\s*\)[^\d]{0,40}(\d{1,4},\d{2})/i]);
  const ttc = findLabeledAmount(text, [/Total en EUR[^\d]{0,40}(\d{1,4},\d{2})/i]);
  if (ht == null && tva == null && ttc == null) return null;

  const htVal = ht ?? 0;
  const tvaVal = tva ?? 0;
  const ttcVal = ttc ?? roundComptaMoney(htVal + tvaVal);
  return {
    ht: htVal,
    tva: tvaVal,
    ttc: ttcVal,
  };
}

function extractUsdReceipt(text: string): { ht: number; tva: number; ttc: number; currency: "USD" } | null {
  const ttcPatterns = [
    /Amount due\s+\$?([\d.]+)\s*USD/i,
    /\$([\d.]+)\s*USD due/i,
    /Total\s+\$?([\d.]+)\s*USD/i,
  ];

  let ttc: number | null = null;
  for (const pattern of ttcPatterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      ttc = parseDecimalAmount(match[1]);
      if (ttc != null && ttc > 0) break;
    }
  }

  if (ttc == null || ttc <= 0) {
    if (!/\bUSD\b/i.test(text) && !/\$\d/.test(text)) return null;
    const amountDue = text.match(/Amount due\s+\$?([\d.]+)/i);
    if (amountDue?.[1]) ttc = parseDecimalAmount(amountDue[1]);
    if (ttc == null || ttc <= 0) {
      const totalMatch =
        text.match(/Subtotal\s+\$?([\d.]+)/i) ?? text.match(/Total\s+\$?([\d.]+)/i);
      if (totalMatch?.[1]) ttc = parseDecimalAmount(totalMatch[1]);
    }
  }

  if (ttc == null || ttc <= 0) return null;

  const taxMatch = text.match(/Tax\s+\$?([\d.]+)\s*USD/i);
  const tva = taxMatch?.[1] ? parseDecimalAmount(taxMatch[1]) ?? 0 : 0;
  const ht = roundComptaMoney(Math.max(0, ttc - tva));
  return { ht, tva, ttc, currency: "USD" };
}

function extractTicketAmounts(text: string): { ht: number; tva: number; ttc: number } | null {
  if (!/justificatif|ticket|note de frais|repas complet/i.test(text)) return null;

  const ttc = findLabeledAmount(text, [
    /TOTAL\s+TTC\s+([\d\s]+[,.]\d{2})/i,
    /Total\s+TTC\s*:?\s*([\d\s]+[,.]\d{2})/i,
    /TOTAL\s+([\d\s]+[,.]\d{2})\s*€/i,
  ]);
  if (ttc == null) return null;

  const tvaMatches = [...text.matchAll(/TVA[^\n]*?([\d\s]+[,.]\d{2})\s*€/gi)];
  const tvaValues = tvaMatches
    .map((m) => parseFrenchAmount(m[1]!))
    .filter((v): v is number => v != null);
  const tva = tvaValues.length
    ? roundComptaMoney(tvaValues.reduce((sum, v) => sum + v, 0))
    : 0;
  const ht = roundComptaMoney(Math.max(0, ttc - tva));
  return { ht, tva, ttc };
}

function suggestCategorie(
  text: string,
  fileName: string,
  tiers: string,
  documentKind: ComptaDepenseExtraction["documentKind"]
): ComptaCategory | "" {
  if (documentKind === "bank_statement") return "Relevé de compte";

  const blob = `${text} ${fileName} ${tiers}`.toLowerCase();
  const pick = (cat: ComptaCategory) => (COMPTA_CATEGORIES.includes(cat) ? cat : "");

  if (/roadshow|inscription\.com|événement|evenement/.test(blob)) return pick("Evenement");
  if (/github|clever\s*cloud|sonar|cursor|google\s*workspace|subscription|developer plan|logiciel|software|saas/.test(blob)) {
    return pick("Logiciel");
  }
  if (/\bformation\b|\bcif\b|\baccompagnement\b/.test(blob)) return pick("Formation");
  if (/restaurant|repas complet|note de frais|brasserie|justificatif/.test(blob)) {
    return pick("Restaurant");
  }
  if (/hotel|hôtel/.test(blob)) return pick("Hotel");
  if (/train|sncf/.test(blob)) return pick("Train");
  if (/avion|flight|air\s/.test(blob)) return pick("Avion");
  if (/assurance/.test(blob)) return pick("Assurances");
  if (/abonnement|subscription|receipt/.test(blob)) return pick("Abonnement");
  return "";
}

function scoreConfidence(
  tiers: string,
  ht: number,
  _tva: number,
  ttc: number
): ComptaDepenseExtraction["confidence"] {
  const hasTiers = tiers.trim().length >= 2;
  if (hasTiers && ttc > 0 && ht > 0) return "high";
  if (hasTiers && ttc > 0) return "medium";
  if (hasTiers || ttc > 0) return "low";
  return "low";
}

/** Extraction dépenses — factures fournisseurs, reçus, tickets. */
export function extractComptaDepenseFromText(
  rawText: string,
  fileName: string
): ComptaDepenseExtraction {
  const text = normalizeComptaPdfText(rawText);

  if (isComptaBankStatementPdf(text, fileName)) {
    return extractBankStatement(text, fileName);
  }

  const tiers = extractDepenseTiers(text, fileName);
  const date = extractComptaDateFromText(text, fileName);

  const usdAmounts = extractUsdReceipt(text);
  const amounts =
    usdAmounts ??
    extractGoogleWorkspaceAmounts(text) ??
    extractTicketAmounts(text) ??
    extractFrenchAmounts(text);
  const currency = usdAmounts?.currency ?? "EUR";

  const suggestedCategorie = suggestCategorie(text, fileName, tiers, "invoice");

  return {
    tiers,
    date,
    ttc: amounts.ttc,
    tva: amounts.tva,
    ht: amounts.ht > 0 ? amounts.ht : computeDepenseHt(amounts.ttc, amounts.tva),
    suggestedCategorie,
    confidence: scoreConfidence(tiers, amounts.ht, amounts.tva, amounts.ttc),
    documentKind: "invoice",
    currency,
  };
}
