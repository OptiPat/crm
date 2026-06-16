import type { ExtractedData } from "../types";
import { parseStelliumAmount } from "./amounts";

export interface ParsedFiscalite {
  trancheImposition?: string;
  nombrePartsFiscales?: number;
  revenuBrutGlobal?: number;
}

function normalizeTmi(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === "-") return undefined;
  const pct = trimmed.match(/(\d{1,2})\s*%/);
  if (pct) return `${pct[1]}%`;
  return trimmed;
}

function extractTmi(section: string): string | undefined {
  const block = section.match(
    /Taux Marginal d'Imposition \(TMI\)\s*([\s\S]{0,120}?)(?=Nombre de parts|Plafond retraite|CSG|Objectifs|$)/i
  )?.[1];
  if (!block) return undefined;

  const values = [...block.matchAll(/(\d{1,2})\s*%/g)].map((m) => `${m[1]}%`);
  if (values.length === 0) return undefined;
  const unique = [...new Set(values)];
  return unique[0];
}

function extractNombreParts(section: string): number | undefined {
  const match = section.match(/Nombre de parts fiscales\s*([\d,\.]+)/i);
  if (!match) return undefined;
  const normalized = match[1].replace(",", ".");
  const value = parseFloat(normalized);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function extractRevenuBrutGlobal(section: string): number | undefined {
  const block = section.match(
    /Revenu brut global\s*([\d\s€]+?)(?=Le foyer fiscal|Impôt sur les revenus soumis|Total des réductions|Taux Marginal|IR net)/i
  )?.[1];
  if (!block) return undefined;
  const amounts = [...block.matchAll(/([\d\s]+)\s*€/g)]
    .map((m) => parseStelliumAmount(m[1]))
    .filter((n): n is number => n != null && n > 0);
  if (amounts.length === 0) return undefined;
  return amounts.reduce((sum, n) => sum + n, 0);
}

/** Parse la section Fiscalité d'un RIO Stellium. */
export function parseStelliumFiscalite(section: string): ParsedFiscalite {
  const result: ParsedFiscalite = {};

  const tmi = extractTmi(section);
  if (tmi) result.trancheImposition = normalizeTmi(tmi);

  const parts = extractNombreParts(section);
  if (parts) result.nombrePartsFiscales = parts;

  const rbg = extractRevenuBrutGlobal(section);
  if (rbg) result.revenuBrutGlobal = rbg;

  return result;
}

export function applyFiscaliteToExtractedData(
  data: ExtractedData,
  fiscalite: ParsedFiscalite
): void {
  if (fiscalite.trancheImposition) data.trancheImposition = fiscalite.trancheImposition;
  if (fiscalite.nombrePartsFiscales != null) {
    data.nombrePartsFiscales = fiscalite.nombrePartsFiscales;
  }
  if (fiscalite.revenuBrutGlobal != null) {
    data.revenuBrutGlobal = fiscalite.revenuBrutGlobal;
  }
}
