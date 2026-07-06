import { computeEncaissementTotals, roundComptaMoney } from "@/lib/compta/compta-money";
import {
  extractComptaDateFromText,
  findLabeledAmount,
  normalizeComptaPdfText,
  parseFrenchAmount,
} from "@/lib/compta/compta-pdf-parse";

export interface ComptaInvoiceExtraction {
  client: string;
  date: string;
  exonere: number;
  ht: number;
  tva: number;
  don: number;
  ttc: number;
  total: number;
  confidence: "low" | "medium" | "high";
}

const normalizeText = normalizeComptaPdfText;
const extractDateFromText = extractComptaDateFromText;

function extractClientFromFileName(fileName: string): string {
  const base = fileName.replace(/\.pdf$/i, "").trim();
  if (/^FACTURE\s+\d+/i.test(base)) return "";
  const withoutDate = base
    .replace(/^20\d{2}[-_]\d{2}[-_]\d{2}[-_\s]*/i, "")
    .replace(/^\d{2}[-_]\d{2}[-_]\d{4}[-_\s]*/i, "")
    .replace(/\bfacture\b/gi, "")
    .replace(/\bencaissement\b/gi, "")
    .replace(/[-_]+/g, " ")
    .trim();
  return withoutDate || "";
}

function extractFinzzActClient(text: string, fileName: string): string {
  const billingMatch = text.match(/Adresse de facturation\s*:\s*\n?\s*([^\n]+)/i);
  if (billingMatch?.[1]) {
    const client = billingMatch[1].trim();
    if (client.length >= 2) return client;
  }

  const labelMatch = text.match(
    /(?:client|factur[ée]\s*[àa]|destinataire)\s*[:\-]?\s*([A-ZÀ-ÖØ-Ý][^\n]{2,60})/i
  );
  if (labelMatch?.[1]) {
    const labelClient = labelMatch[1].trim().split(/\n/)[0]!.trim();
    if (labelClient.length >= 2) return labelClient;
  }

  return extractClientFromFileName(fileName);
}

function extractClientAfterIssuerBlock(text: string): string | null {
  const blockMatch = text.match(/\bEI\s+[^\n]+\n([\s\S]*?)(?=DESCRIPTION|MONTANT\s+TTC)/i);
  if (!blockMatch?.[1]) return null;

  const lines = blockMatch[1].split("\n").map((l) => l.trim()).filter(Boolean);
  let seenIssuerSiret = false;

  for (const line of lines) {
    if (/^SIRET\s+\d/i.test(line)) {
      seenIssuerSiret = true;
      continue;
    }
    if (!seenIssuerSiret) continue;
    if (/^SIREN\s+\d/i.test(line)) continue;
    if (/^SIRET\s+\d/i.test(line)) continue;
    if (/^(RIB|IBAN|BIC|RT)$/i.test(line)) continue;
    if (/^\d{5}\s+[A-ZÀ-ÖØ-Ý]/i.test(line)) continue;
    if (/^\d+\s+[A-Z0-9\s,'-]+,\s*\d{5}\s/i.test(line)) continue;
    if (/^\d+\s+(?:IMPASSE|RUE|AVENUE|CHEMIN|PLACE|BD|BOULEVARD)/i.test(line)) continue;
    if (/^[A-ZÀ-ÖØ-Ý][A-ZÀ-ÖØ-Ý\s'-]{2,}$/.test(line)) {
      return line;
    }
  }
  return null;
}

function extractClassicClient(text: string, fileName: string): string {
  const billingMatch = text.match(/Adresse de facturation\s*:\s*\n?\s*([^\n]+)/i);
  if (billingMatch?.[1]) {
    return billingMatch[1].trim();
  }

  const eiLines = [...text.matchAll(/\bEI\s+([^\n]+)/gi)];
  if (eiLines.length >= 2) {
    return eiLines[1]![0]!.replace(/\s+/g, " ").trim();
  }

  const afterIssuer = extractClientAfterIssuerBlock(text);
  if (afterIssuer) return afterIssuer;

  const dual = text.match(/\bPLAZA\s+([^\n]+)/i);
  if (dual?.[1]) {
    const name = dual[1].trim();
    if (name.length >= 2 && !/^PLAZA|Nicolas/i.test(name)) return name;
  }

  const billed = text.match(
    /(?:Factur[ée]\s+[àa]\s*:|Client\s*:|Destinataire\s*:)\s*([^\n]+)/i
  );
  if (billed?.[1]) {
    const client = billed[1].trim();
    if (client.length >= 2 && !/^\d{2}[/.-]\d{2}/.test(client)) return client;
  }

  const fromName = extractClientFromFileName(fileName);
  if (fromName.length >= 2) return fromName;

  return extractFinzzActClient(text, fileName);
}

function isFinzzActInvoice(text: string): boolean {
  return /Programme FinzzAct|TOTAL\s+EXON[EÉ]R[EÉ]\s*\*/i.test(text);
}

function isClassicInvoice(text: string): boolean {
  return /Total\s+(HT|TTC)|MONTANT\s+TTC|Date de facturation/i.test(text);
}

/** Zone FinzzAct : entre « Don » et « TOTAL REGLE PAR » (exclut le total réglé). */
function finzzActDonZone(text: string): string | null {
  const start = text.search(/(?:Programme FinzzAct|Don à un organisme)/i);
  if (start < 0) return null;

  let end = text.length;
  const regleRel = text.slice(start).search(/TOTAL\s+R[ÉEÈ]GL[ÉEÈ]\s+PAR/i);
  if (regleRel >= 0) end = start + regleRel;

  return text.slice(start, end);
}

function isPlausibleDonAmount(
  value: number,
  ht: number,
  tva: number,
  exonere: number
): boolean {
  if (value <= 0) return false;
  const ttc = roundComptaMoney(ht + tva);
  if (ttc > 0 && value <= ttc * 3) return true;
  if (exonere > 0 && value < exonere) return true;
  return value <= 500;
}

function extractFinzzActDon(
  text: string,
  ht: number,
  tva: number,
  exonere: number
): number | null {
  const zone = finzzActDonZone(text);
  if (!zone) return null;

  const lines = zone.split(/\n/);

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!/^[-–—−]$/.test(line)) continue;

    for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
      const next = lines[j]!.trim();
      if (!next || next === "€") continue;

      const sameLine = next.match(/^([\d\s]+[,.]\d{2})\s*€?$/);
      if (sameLine?.[1]) {
        const value = parseFrenchAmount(sameLine[1]);
        if (value != null && isPlausibleDonAmount(value, ht, tva, exonere)) {
          return value;
        }
      }

      if (next === "€" && j >= i + 2) {
        const prev = lines[j - 1]!.trim().match(/^([\d\s]+[,.]\d{2})$/);
        if (prev?.[1]) {
          const value = parseFrenchAmount(prev[1]);
          if (value != null && isPlausibleDonAmount(value, ht, tva, exonere)) {
            return value;
          }
        }
      }
    }
  }

  for (const line of lines) {
    const inline = line.trim().match(/^[-–—−]\s*([\d\s]+[,.]\d{2})\s*€?$/);
    if (inline?.[1]) {
      const value = parseFrenchAmount(inline[1]);
      if (value != null && isPlausibleDonAmount(value, ht, tva, exonere)) {
        return value;
      }
    }
  }

  for (const match of zone.matchAll(/[-–—−][\s\n\r]*([\d\s]+[,.]\d{2})(?:[\s\n\r]*€)?/gi)) {
    const value = parseFrenchAmount(match[1]!);
    if (value != null && isPlausibleDonAmount(value, ht, tva, exonere)) {
      return value;
    }
  }

  const cgiIdx = zone.search(/code g[ée]n[ée]ral des imp[ôo]ts|\(\s*CGI\s*\)|Article\s+200/i);
  const tail = cgiIdx >= 0 ? zone.slice(cgiIdx) : zone;
  const ttc = roundComptaMoney(ht + tva);
  const knownTotals = new Set(
    [ht, tva, exonere, ttc].filter((v) => v > 0).map((v) => roundComptaMoney(v))
  );
  const amounts = [...tail.matchAll(/([\d\s]+[,.]\d{2})\s*€/gi)]
    .map((m) => parseFrenchAmount(m[1]!))
    .filter(
      (v): v is number =>
        v != null &&
        !knownTotals.has(v) &&
        isPlausibleDonAmount(v, ht, tva, exonere)
    );

  if (amounts.length > 0) {
    return Math.min(...amounts);
  }

  return null;
}

function scoreConfidence(
  client: string,
  ht: number,
  tva: number,
  exonere: number
): ComptaInvoiceExtraction["confidence"] {
  const hasClient = client.trim().length >= 2;
  if (hasClient && ht > 0 && tva >= 0 && (exonere > 0 || ht > 0)) {
    return "high";
  }
  if (hasClient && (exonere > 0 || ht > 0 || tva > 0)) {
    return "medium";
  }
  if (hasClient || exonere > 0 || ht > 0 || tva > 0) return "low";
  return "low";
}

function extractFinzzActInvoice(
  text: string,
  fileName: string
): ComptaInvoiceExtraction {
  const client = extractFinzzActClient(text, fileName);
  const date = extractDateFromText(text, fileName);

  const exonere =
    findLabeledAmount(text, [
      /TOTAL\s+EXON[EÉ]R[EÉ]\s*\*?\s*:\s*([\d\s]+[,.]\d{2})/i,
      /(?:montant\s*)?total\s*exon[ée]r[ée]?\s*\*?\s*[:\s]+([\d\s]+[,.]\d{2})/i,
    ]) ?? 0;

  const ht =
    findLabeledAmount(text, [
      /TOTAL\s+HT\s*:\s*([\d\s]+[,.]\d{2})/i,
      /(?:montant\s*)?total\s*h\.?\s*t\.?\s*[:\s]+([\d\s]+[,.]\d{2})/i,
    ]) ?? 0;

  const tva =
    findLabeledAmount(text, [
      /TOTAL\s+TVA\s*:\s*([\d\s]+[,.]\d{2})/i,
      /(?:montant\s*)?total\s*t\.?\s*v\.?\s*a\.?\s*[:\s]+([\d\s]+[,.]\d{2})/i,
    ]) ?? 0;

  const don = extractFinzzActDon(text, ht, tva, exonere) ?? 0;
  const { ttc, total } = computeEncaissementTotals(exonere, ht, tva, don);

  return {
    client,
    date,
    exonere,
    ht,
    tva,
    don,
    ttc,
    total,
    confidence: scoreConfidence(client, ht, tva, exonere),
  };
}

/** Factures classiques : Total HT / TVA % montant / Total TTC ou MONTANT TTC seul. */
function extractClassicInvoice(
  text: string,
  fileName: string
): ComptaInvoiceExtraction {
  const client = extractClassicClient(text, fileName);
  const date = extractDateFromText(text, fileName);

  const htRaw = findLabeledAmount(text, [
    /Total\s+HT\s+([\d\s]+[,.]\d{2})/i,
    /TOTAL\s+HT\s*[:\s]+([\d\s]+[,.]\d{2})/i,
  ]);

  const tvaRaw = findLabeledAmount(text, [
    /TVA\s+[\d\s]+[,.]\d+\s*%\s+([\d\s]+[,.]\d{2})/i,
    /Total\s+TVA\s+([\d\s]+[,.]\d{2})/i,
    /TOTAL\s+TVA\s*[:\s]+([\d\s]+[,.]\d{2})/i,
  ]);

  const ttcRaw = findLabeledAmount(text, [
    /Total\s+TTC\s+([\d\s]+[,.]\d{2})/i,
    /TOTAL\s+TTC\s*[:\s]+([\d\s]+[,.]\d{2})/i,
  ]);

  const montantTtcSection = text.split(/MONTANT\s+TTC/i)[1];
  const montantTtc = montantTtcSection
    ? findLabeledAmount(montantTtcSection, [
        /€\s*([\d\s]+(?:[,.]\d{2})?)/i,
        /([\d\s]+(?:[,.]\d{2})?)\s*€/i,
      ])
    : findLabeledAmount(text, [
        /MONTANT\s+TTC[\s\S]{0,80}?€\s*([\d\s]+(?:[,.]\d{2})?)/i,
        /MONTANT\s+TTC[\s\S]{0,80}?([\d\s]+(?:[,.]\d{2})?)\s*€/i,
      ]);

  const ttcLine = ttcRaw ?? montantTtc;
  let ht = htRaw ?? 0;
  let tva = tvaRaw ?? 0;

  if (ttcLine != null) {
    if (htRaw != null && tvaRaw == null) {
      tva = roundComptaMoney(Math.max(0, ttcLine - htRaw));
    } else if (htRaw == null && tvaRaw == null) {
      ht = ttcLine;
      tva = 0;
    }
  }

  const exonere = 0;
  const don = 0;
  const { ttc, total } = computeEncaissementTotals(exonere, ht, tva, don);

  return {
    client,
    date,
    exonere,
    ht,
    tva,
    don,
    ttc,
    total,
    confidence: scoreConfidence(client, ht, tva, exonere),
  };
}

/** Extraction encaissements — profil FinzzAct ou facture classique. */
export function extractComptaInvoiceFromText(
  rawText: string,
  fileName: string
): ComptaInvoiceExtraction {
  const text = normalizeText(rawText);

  if (isFinzzActInvoice(text)) {
    return extractFinzzActInvoice(text, fileName);
  }
  if (isClassicInvoice(text)) {
    return extractClassicInvoice(text, fileName);
  }

  return extractClassicInvoice(text, fileName);
}
