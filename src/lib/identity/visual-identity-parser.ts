/** Extraction visuelle date / lieu de naissance (hors MRZ). */

import {
  sanitizeBirthPlace,
  sanitizePersonName,
} from "@/lib/identity/identity-field-validation";

export type VisualIdentityFields = {
  nom?: string;
  prenom?: string;
  dateNaissance?: string;
  dateExpiration?: string;
  lieuNaissance?: string;
};

function normalizeOcrText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/[|]/g, "I")
    .replace(/[°º]/g, "o")
    .replace(/[Oo](?=\s*\d)/g, "0");
}

const DATE_TOKEN = String.raw`\d{1,2}[\s./-]+\d{1,2}[\s./-]+\d{4}`;

/** jj/mm/aaaa, jj.mm.aaaa ou jj mm aaaa → jj/mm/aaaa */
export function normalizeIdentityDate(raw: string): string | undefined {
  const m = raw.trim().match(/^(\d{1,2})[\s./-]+(\d{1,2})[\s./-]+(\d{4})$/);
  if (!m) return undefined;
  const dd = m[1]!.padStart(2, "0");
  const mm = m[2]!.padStart(2, "0");
  const yyyy = m[3]!;
  const d = parseInt(dd, 10);
  const mo = parseInt(mm, 10);
  const y = parseInt(yyyy, 10);
  if (d < 1 || d > 31 || mo < 1 || mo > 12 || y < 1900 || y > 2100) return undefined;
  return `${dd}/${mm}/${yyyy}`;
}

function extractLikelyBirthDate(text: string): string | undefined {
  const normalized = normalizeOcrText(text);
  const dateRe = new RegExp(`\\b(${DATE_TOKEN})\\b`, "g");
  const candidates: { date: string; score: number }[] = [];

  let match: RegExpExecArray | null;
  while ((match = dateRe.exec(normalized)) !== null) {
    const date = normalizeIdentityDate(match[1]!);
    if (!date) continue;

    const year = parseInt(date.slice(6, 10), 10);
    const before = normalized.slice(Math.max(0, match.index - 50), match.index).toLowerCase();
    const after = normalized.slice(match.index, match.index + 50).toLowerCase();

    let score = 0;
    if (/n[eé6]|naissance|birth/.test(before)) score += 35;
    if (/valable|jusqu|expir|valid|delivr/.test(before)) score -= 45;
    if (/valable|jusqu|expir|valid/.test(after)) score -= 35;
    if (year >= 2020) score -= 30;
    if (year >= 1920 && year <= 2010) score += 25;
    if (year >= 2011 && year <= new Date().getFullYear()) score += 10;

    candidates.push({ date, score });
  }

  candidates.sort((a, b) => b.score - a.score);
  const best = candidates[0];
  if (best && best.score >= 15) return best.date;
  const fallback = candidates.find((c) => c.score >= 0 && parseInt(c.date.slice(6, 10), 10) < 2020);
  return fallback?.date;
}

function extractLikelyBirthPlace(text: string, birthDate?: string): string | undefined {
  const normalized = normalizeOcrText(text);

  if (birthDate) {
    const escaped = birthDate.replace(/\//g, "[\\s./-]+");
    const nearDate = new RegExp(
      `${escaped}[\\s\\S]{0,100}?[AÀa@]\\s*:?\\s*([A-ZÀ-ÜÉÈÊÎÏÔÙÇ'()0-9 -]{2,})`,
      "i"
    );
    const nearMatch = normalized.match(nearDate);
    if (nearMatch) {
      const place = sanitizeBirthPlace(cleanPlaceToken(nearMatch[1]!));
      if (place) return titleCasePlace(place);
    }
  }

  const placePatterns = [
    new RegExp(
      `N[eé6]\\(?e?\\)?\\s*le\\s*:?\\s*${DATE_TOKEN}[\\s\\S]{0,80}?[AÀa@]\\s*:?\\s*([A-ZÀ-ÜÉÈÊÎÏÔÙÇ'()0-9 -]{2,})`,
      "i"
    ),
    /Lieu\s+de\s+naissance\s*:?\s*([A-ZÀ-ÜÉÈÊÎÏÔÙÇ'()0-9 -]{2,})/i,
  ];

  for (const pattern of placePatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const place = sanitizeBirthPlace(cleanPlaceToken(match[1]!));
      if (place) return titleCasePlace(place);
    }
  }

  return undefined;
}

function cleanPlaceToken(raw: string): string {
  return raw
    .split("\n")[0]!
    .replace(/\s+/g, " ")
    .replace(/\s+(Taille|Sexe|SEX|M|F|Nationalit[eé].*)$/i, "")
    .trim();
}

export function extractVisualIdentityFields(text: string): VisualIdentityFields {
  const normalized = normalizeOcrText(text);
  const result: VisualIdentityFields = {};

  const nomPatterns = [
    /\bNom\s*:?\s*([A-ZÀ-ÜÉÈÊÎÏÔÙÇ' -]{2,})/i,
    /\bNom\s*\n+\s*([A-ZÀ-ÜÉÈÊÎÏÔÙÇ' -]{2,})/i,
    /\bSurname\s*:?\s*([A-ZÀ-ÜÉÈÊÎÏÔÙÇ' -]{2,})/i,
  ];
  for (const pattern of nomPatterns) {
    const match = normalized.match(pattern);
    const nom = sanitizePersonName(match?.[1]?.trim().toUpperCase());
    if (nom) {
      result.nom = nom;
      break;
    }
  }

  const prenomPatterns = [
    /\bPr[éeé]nom(?:\(s\))?\s*:?\s*([A-Za-zÀ-üÉÈÊÎÏÔùç' -]{2,})/i,
    /\bPr[éeé]nom(?:\(s\))?\s*\n+\s*([A-Za-zÀ-üÉÈÊÎÏÔùç' -]{2,})/i,
    /\bGiven\s+names?\s*:?\s*([A-Za-zÀ-üÉÈÊÎÏÔùç' -]{2,})/i,
  ];
  for (const pattern of prenomPatterns) {
    const match = normalized.match(pattern);
    const raw = match?.[1]?.split(/\s{2,}|\n/)[0]?.trim();
    const prenom = sanitizePersonName(raw);
    if (prenom) {
      result.prenom = titleCaseName(prenom);
      break;
    }
  }

  const birthPatterns = [
    new RegExp(`N[eé6]\\(?e?\\)?\\s*le\\s*:?\\s*(${DATE_TOKEN})`, "i"),
    new RegExp(`Date\\s+de\\s+naissance\\s*:?\\s*(${DATE_TOKEN})`, "i"),
    new RegExp(`Birth\\s*:?\\s*(${DATE_TOKEN})`, "i"),
  ];

  for (const pattern of birthPatterns) {
    const match = normalized.match(pattern);
    if (match) {
      const date = normalizeIdentityDate(match[1]!);
      if (date) {
        result.dateNaissance = date;
        break;
      }
    }
  }

  if (!result.dateNaissance) {
    result.dateNaissance = extractLikelyBirthDate(normalized);
  }

  result.dateExpiration = extractVisualExpiryDate(normalized);
  result.lieuNaissance = extractLikelyBirthPlace(normalized, result.dateNaissance);

  return result;
}

function extractVisualExpiryDate(text: string): string | undefined {
  const expiryPatterns = [
    new RegExp(`Carte\\s+valable\\s+jusqu['']?au\\s*:?\\s*(${DATE_TOKEN})`, "i"),
    new RegExp(`Valable\\s+jusqu['']?au\\s*:?\\s*(${DATE_TOKEN})`, "i"),
    new RegExp(`Date\\s+d['']expiration\\s*:?\\s*(${DATE_TOKEN})`, "i"),
    new RegExp(`Expiry\\s+date\\s*:?\\s*(${DATE_TOKEN})`, "i"),
  ];

  for (const pattern of expiryPatterns) {
    const match = text.match(pattern);
    if (match) {
      const date = normalizeIdentityDate(match[1]!);
      if (date) return date;
    }
  }

  return undefined;
}

function titleCasePlace(value: string): string {
  return value
    .split(/(\s|-)/)
    .map((part) => {
      if (part === " " || part === "-") return part;
      if (part.length <= 2 && part === part.toUpperCase()) return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}

function titleCaseName(value: string): string {
  return value
    .split(/(\s|-)/)
    .map((part) => {
      if (part === " " || part === "-") return part;
      return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
    })
    .join("");
}
