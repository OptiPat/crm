import { mrzCheckDigitValid } from "@/lib/identity/mrz-checksum";
import {
  isPlausiblePersonName,
  sanitizePersonName,
} from "@/lib/identity/identity-field-validation";

export type MrzFormat = "TD1" | "TD2" | "TD3" | "FRA_LEGACY";

export type MrzChecksVerified = {
  documentNumber: boolean;
  birthDate: boolean;
  expiryDate: boolean;
};

export type ParsedMrz = {
  format: MrzFormat;
  documentType: string;
  issuingCountry: string;
  documentNumber: string;
  surname: string;
  givenNames: string;
  /** jj/mm/aaaa */
  dateNaissance?: string;
  /** jj/mm/aaaa */
  dateExpiration?: string;
  sex?: "M" | "F";
  nationality?: string;
  /** Score 0–100 */
  confidence: number;
  rawLines: string[];
  checksVerified: MrzChecksVerified;
};

export function isMrzFullyVerified(mrz: ParsedMrz): boolean {
  return mrz.checksVerified.birthDate && mrz.checksVerified.documentNumber;
}

// Borne haute tolérante : l'OCR ajoute souvent des caractères de remplissage
// parasites. Le code aval normalise toujours à la longueur canonique
// (44/36/30) via padEnd/slice, donc une ligne légèrement trop longue reste
// exploitable au lieu d'être rejetée (sinon la MRZ passeport entière est perdue).
const MRZ_LINE_RE = /^[A-Z0-9<]{28,50}$/;

/** Ligne MRZ plausible (présence de `<` ou préfixe ICAO / n° carte FR). */
function looksLikeMrzLine(line: string): boolean {
  if (!MRZ_LINE_RE.test(line)) return false;
  if (/^ID[A-Z]{3}/.test(line)) return true;
  if (/^P<[A-Z]{3}/.test(line)) return true;
  if (/^I<[A-Z]{3}/.test(line)) return true;
  if (/^A<[A-Z]{3}/.test(line)) return true;
  if (/^C<[A-Z]{3}/.test(line)) return true;
  if (/^\d{12}/.test(line)) return true;
  const fillerCount = (line.match(/</g) ?? []).length;
  return fillerCount >= 5;
}

export function normalizeMrzLine(line: string): string {
  return line
    .toUpperCase()
    .replace(/\s+/g, "")
    .replace(/[^A-Z0-9<]/g, "<");
}

/** Extrait les lignes MRZ d'un texte OCR ou natif. */
export function extractMrzLines(text: string): string[] {
  const lines = text
    .split(/\r?\n/)
    .map((l) => normalizeMrzLine(l.trim()))
    .filter((l) => looksLikeMrzLine(l));

  if (lines.length >= 3 && lines.every((l) => l.length >= 28 && l.length <= 32)) {
    return lines.slice(-3).map((l) => l.padEnd(30, "<").slice(0, 30));
  }
  if (lines.length >= 2) {
    const lastTwo = lines.slice(-2);
    const len = lastTwo[0]?.length ?? 0;
    if (len >= 42) {
      return lastTwo.map((l) => l.padEnd(44, "<").slice(0, 44));
    }
    return lastTwo.map((l) => l.padEnd(36, "<").slice(0, 36));
  }
  return [];
}

function parseMrzNameField(field: string): { surname: string; givenNames: string } {
  const parts = field.split("<<").filter(Boolean);
  const surname = (parts[0] ?? "").replace(/</g, " ").trim();
  const givenNames = (parts.slice(1).join(" ") || "").replace(/</g, " ").trim();
  return { surname, givenNames };
}

function yyMmDdToFr(yyMmDd: string): string | undefined {
  if (!/^\d{6}$/.test(yyMmDd)) return undefined;
  const yy = parseInt(yyMmDd.slice(0, 2), 10);
  const mm = yyMmDd.slice(2, 4);
  const dd = yyMmDd.slice(4, 6);
  let year = yy >= 40 ? 1900 + yy : 2000 + yy;
  const currentYear = new Date().getFullYear();
  if (year > currentYear) year -= 100;
  return `${dd}/${mm}/${year}`;
}

/** Dates d'expiration MRZ — plage 2000–2099 (ICAO). */
function yyMmDdToFrExpiry(yyMmDd: string): string | undefined {
  if (!/^\d{6}$/.test(yyMmDd)) return undefined;
  const yy = parseInt(yyMmDd.slice(0, 2), 10);
  const mm = yyMmDd.slice(2, 4);
  const dd = yyMmDd.slice(4, 6);
  const year = 2000 + yy;
  if (year < 1980 || year > 2100) return undefined;
  return `${dd}/${mm}/${year}`;
}

function parseTd3(lines: string[]): ParsedMrz | null {
  const [line1, line2] = lines;
  if (!line1 || !line2 || line1.length !== 44 || line2.length !== 44) return null;

  const documentType = line1.slice(0, 2).replace(/</g, "").trim();
  const issuingCountry = line1.slice(2, 5);
  const nameField = line1.slice(5);
  const { surname, givenNames } = parseMrzNameField(nameField);

  const docNumber = line2.slice(0, 9);
  const docCheck = line2[9];
  const nationality = line2.slice(10, 13);
  const birthRaw = line2.slice(13, 19);
  const birthCheck = line2[19];
  const sex = line2[20] === "F" ? "F" : line2[20] === "M" ? "M" : undefined;
  const expiryRaw = line2.slice(21, 27);
  const expiryCheck = line2[27];

  const docVerified = mrzCheckDigitValid(docNumber, docCheck);
  const birthVerified = mrzCheckDigitValid(birthRaw, birthCheck);
  const expiryVerified = mrzCheckDigitValid(expiryRaw, expiryCheck);

  let confidence = 40;
  if (docVerified) confidence += 25;
  if (birthVerified) confidence += 25;
  if (dateNaissanceFromMrz(birthRaw)) confidence += 10;

  return {
    format: "TD3",
    documentType,
    issuingCountry,
    documentNumber: docNumber.replace(/</g, ""),
    surname,
    givenNames,
    dateNaissance: yyMmDdToFr(birthRaw),
    dateExpiration: yyMmDdToFrExpiry(expiryRaw),
    sex,
    nationality: nationality.replace(/</g, ""),
    confidence: Math.min(100, confidence),
    rawLines: lines,
    checksVerified: {
      documentNumber: docVerified,
      birthDate: birthVerified,
      expiryDate: expiryVerified,
    },
  };
}

function parseTd1(lines: string[]): ParsedMrz | null {
  if (lines.length < 3) return null;
  const [line1, line2, line3] = lines.map((l) => l.padEnd(30, "<").slice(0, 30));
  if (!line1 || !line2 || !line3) return null;

  const documentType = line1.slice(0, 2).replace(/</g, "").trim();
  const issuingCountry = line1.slice(2, 5);
  const docNumber = line1.slice(5, 14).replace(/</g, "");
  const docCheck = line1[14];

  const birthRaw = line2.slice(0, 6);
  const birthCheck = line2[6];
  const sex = line2[7] === "F" ? "F" : line2[7] === "M" ? "M" : undefined;
  const expiryRaw = line2.slice(8, 14);
  const expiryCheck = line2[14];
  const nationality = line2.slice(15, 18).replace(/</g, "");

  const { surname, givenNames } = parseMrzNameField(line3);

  const docVerified = mrzCheckDigitValid(line1.slice(5, 14), docCheck);
  const birthVerified = mrzCheckDigitValid(birthRaw, birthCheck);
  const expiryVerified = mrzCheckDigitValid(expiryRaw, expiryCheck);

  let confidence = 40;
  if (docVerified) confidence += 25;
  if (birthVerified) confidence += 25;
  if (yyMmDdToFr(birthRaw)) confidence += 10;

  return {
    format: "TD1",
    documentType,
    issuingCountry,
    documentNumber: docNumber,
    surname,
    givenNames,
    dateNaissance: yyMmDdToFr(birthRaw),
    dateExpiration: yyMmDdToFrExpiry(expiryRaw),
    sex,
    nationality,
    confidence: Math.min(100, confidence),
    rawLines: lines,
    checksVerified: {
      documentNumber: docVerified,
      birthDate: birthVerified,
      expiryDate: expiryVerified,
    },
  };
}

function parseTd2(lines: string[]): ParsedMrz | null {
  const [line1, line2] = lines;
  if (!line1 || !line2 || line1.length !== 36 || line2.length !== 36) return null;

  const documentType = line1.slice(0, 2).replace(/</g, "").trim();
  const issuingCountry = line1.slice(2, 5);
  const { surname, givenNames: namesFromLine1 } = parseMrzNameField(line1.slice(5));

  const docNumber = line2.slice(0, 9).replace(/</g, "");
  const docCheck = line2[9];
  const nationality = line2.slice(10, 13).replace(/</g, "");
  const birthRaw = line2.slice(13, 19);
  const birthCheck = line2[19];
  const sex = line2[20] === "F" ? "F" : line2[20] === "M" ? "M" : undefined;
  const expiryRaw = line2.slice(21, 27);
  const expiryCheck = line2[27];

  const docVerified = mrzCheckDigitValid(line2.slice(0, 9), docCheck);
  const birthVerified = mrzCheckDigitValid(birthRaw, birthCheck);
  const expiryVerified = mrzCheckDigitValid(expiryRaw, expiryCheck);

  let confidence = 35;
  if (docVerified) confidence += 25;
  if (birthVerified) confidence += 25;

  return {
    format: "TD2",
    documentType,
    issuingCountry,
    documentNumber: docNumber,
    surname,
    givenNames: namesFromLine1,
    dateNaissance: yyMmDdToFr(birthRaw),
    dateExpiration: yyMmDdToFrExpiry(expiryRaw),
    sex,
    nationality,
    confidence: Math.min(100, confidence),
    rawLines: lines,
    checksVerified: {
      documentNumber: docVerified,
      birthDate: birthVerified,
      expiryDate: expiryVerified,
    },
  };
}

/** Ancienne CNI française (2×36) — n° carte 12 chiffres, prénoms sur ligne 2. */
function parseFrenchLegacyId(lines: string[]): ParsedMrz | null {
  const [line1, line2] = lines;
  if (!line1 || !line2 || line1.length !== 36 || line2.length !== 36) return null;
  if (!line1.startsWith("IDFRA")) return null;
  if (!/^\d{12}/.test(line2)) return null;

  const { surname } = parseMrzNameField(line1.slice(5));
  const docNumber = line2.slice(0, 12);
  const docCheck = line2[12];

  const tail = line2.slice(13);
  const birthMatch = tail.match(/(\d{6})\d[MF]\d$/);
  if (!birthMatch) return null;
  const birthRaw = birthMatch[1]!;
  const birthStart = tail.indexOf(birthRaw);
  const givenRaw = tail.slice(0, birthStart).replace(/<+$/, "");
  const givenNames = givenRaw.replace(/</g, " ").trim();
  const sexChar = tail[birthStart + 6 + 1];

  const docVerified = mrzCheckDigitValid(docNumber, docCheck);
  const birthVerified = yyMmDdToFr(birthRaw) != null;

  let confidence = 45;
  if (docVerified) confidence += 25;
  if (birthVerified) confidence += 20;

  return {
    format: "FRA_LEGACY",
    documentType: "ID",
    issuingCountry: "FRA",
    documentNumber: docNumber,
    surname,
    givenNames,
    dateNaissance: yyMmDdToFr(birthRaw),
    sex: sexChar === "F" ? "F" : sexChar === "M" ? "M" : undefined,
    nationality: "FRA",
    confidence: Math.min(100, confidence),
    rawLines: lines,
    checksVerified: {
      documentNumber: docVerified,
      birthDate: birthVerified && docVerified,
      expiryDate: false,
    },
  };
}

function dateNaissanceFromMrz(birthRaw: string): boolean {
  return yyMmDdToFr(birthRaw) != null;
}

function finalizeMrz(parsed: ParsedMrz | null): ParsedMrz | null {
  if (!parsed) return null;

  const surname = sanitizePersonName(parsed.surname) ?? "";
  const givenNames = sanitizePersonName(parsed.givenNames) ?? "";
  const adjusted = {
    ...parsed,
    surname,
    givenNames,
  };

  const hasValidName = isPlausiblePersonName(surname) || isPlausiblePersonName(givenNames);
  const hasValidBirth = Boolean(parsed.dateNaissance && parsed.confidence >= 65);

  if (!hasValidName && !hasValidBirth) return null;
  if (!hasValidName && parsed.confidence < 55) return null;

  return adjusted;
}

export function parseMrzLines(lines: string[]): ParsedMrz | null {
  const normalized = lines.map((l) => normalizeMrzLine(l)).filter(Boolean);
  if (normalized.length < 2) return null;

  if (normalized.length >= 3 && normalized.every((l) => l.length <= 32)) {
    const td1 = finalizeMrz(parseTd1(normalized.slice(-3)));
    if (td1) return td1;
  }

  const two = normalized.slice(-2).map((l) => {
    if (l.length >= 42) return l.padEnd(44, "<").slice(0, 44);
    return l.padEnd(36, "<").slice(0, 36);
  });

  if (two[0]?.startsWith("IDFRA") && /^\d{12}/.test(two[1] ?? "")) {
    const fra = finalizeMrz(parseFrenchLegacyId(two));
    if (fra) return fra;
  }

  if (two[0]?.length === 44 && two[1]?.length === 44) {
    const td3 = finalizeMrz(parseTd3(two));
    if (td3) return td3;
  }

  return finalizeMrz(parseTd2(two));
}

export function parseMrzFromText(text: string): ParsedMrz | null {
  const lines = extractMrzLines(text);
  if (lines.length < 2) return null;
  return parseMrzLines(lines);
}
