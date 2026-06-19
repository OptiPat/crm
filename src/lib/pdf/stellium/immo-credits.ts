import type { BienImmobilier } from "../types";

export interface StelliumMortgageCredit {
  /** Libellé lu dans la désignation (« Primo MTP », « Pinel sète », « RP », …). */
  designation: string;
  productType: string;
  propertyName: string;
  echeanceAnnuelle: number;
  crd: number;
  dateFinCredit?: string;
}

const PRODUCT_TYPES =
  "RP|Classique|Pinel|LMNP|LMP|SCPI|Denormandie|Malraux|MH|Monument Historique|D[eé]ficit Foncier|DF";

function parseAmounts(text: string): {
  echeanceRaw: string;
  crdRaw: string;
  dateFinCredit?: string;
  beforeAmounts: string;
  afterAmounts: string;
} | undefined {
  const cleaned = text.replace(/\s+TOTAL\b[\s\S]*$/i, "").trim();
  const match = cleaned.match(
    /([\d\s,]+)\s*€\s+([\d\s,]+)\s*€(?:\s+(\d{2}\/\d{2}\/\d{4}))?/
  );
  if (!match) return undefined;
  const afterIndex = (match.index ?? 0) + match[0].length;
  return {
    beforeAmounts: cleaned.slice(0, match.index).trim(),
    afterAmounts: cleaned.slice(afterIndex).trim(),
    echeanceRaw: match[1],
    crdRaw: match[2],
    dateFinCredit: match[3],
  };
}

function stripBorrowerSuffix(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return trimmed;

  const withoutInitial = trimmed
    .replace(/\s+[A-ZÀ-Ü][a-zà-üéèê'ô.-]+\s+[A-ZÀ-Ü]\.?\s*$/i, "")
    .trim();
  if (withoutInitial && withoutInitial.length < trimmed.length) return withoutInitial;

  const words = trimmed.split(/\s+/);
  if (words.length <= 2) return trimmed;

  const [first, last] = words.slice(-2);
  if (
    /^[A-ZÀ-Ü][a-zà-üéèê'ô.-]+$/.test(first) &&
    /^[A-ZÀ-Ü][A-ZÀ-Ü'\-]+$/.test(last)
  ) {
    const withoutBorrower = words.slice(0, -2).join(" ").trim();
    return withoutBorrower || trimmed;
  }

  return trimmed;
}

/**
 * Retire l'emprunteur final (« … Prénom NOM ») et renvoie le résidu = nom du
 * bien. Si la chaîne est uniquement « Prénom NOM » (aucun résidu), renvoie "".
 */
function stripTrailingBorrower(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  if (!trimmed) return "";
  const withResidue = trimmed.match(
    /^(.*?)\s+[A-ZÀ-Ü][a-zà-üéèê'ô.-]+\s+[A-ZÀ-Ü][A-ZÀ-Ü'-]+$/
  );
  if (withResidue) return withResidue[1].trim();
  if (/^[A-ZÀ-Ü][a-zà-üéèê'ô.-]+\s+[A-ZÀ-Ü][A-ZÀ-Ü'-]+$/.test(trimmed)) return "";
  return trimmed;
}

function parseCreditDesignation(
  before: string,
  after: string
): {
  designation: string;
  productType: string;
  propertyName: string;
} {
  const { productType, propertyName: beforeName } = parseDesignationTail(before);

  let propertyName = stripBorrowerSuffix(beforeName);
  // Stellium reporte souvent le nom du bien APRÈS les montants (ligne PDF
  // suivante : « 9454 € 166183 € 10/11/2046 Primo MTP Nicolas PLAZA »).
  if (!propertyName) {
    const afterName = stripTrailingBorrower(after);
    if (afterName) propertyName = afterName;
  }

  const designation = propertyName || beforeName || before || productType;
  return { designation, productType, propertyName };
}

/** Une seule voie de parse : tabs pdfjs → espaces, puis lecture linéaire. */
function parseCreditRow(row: string): StelliumMortgageCredit | undefined {
  const normalizedRow = row.replace(/\t+/g, " ").replace(/\s+/g, " ");
  const prefix = normalizedRow.match(/^Cr[ée]dit\s+immobilier\s*[-–—]\s*Amortissable\s*[-–—]\s*/i);
  if (!prefix) return undefined;

  const amounts = parseAmounts(normalizedRow.slice(prefix[0].length));
  if (!amounts) return undefined;

  const echeanceAnnuelle = parseEuroAmount(amounts.echeanceRaw);
  const crd = parseEuroAmount(amounts.crdRaw);
  if (!echeanceAnnuelle || !crd) return undefined;

  const body = amounts.beforeAmounts.replace(/\s+/g, " ").trim();
  const afterBody = amounts.afterAmounts.replace(/\s+/g, " ").trim();
  const { designation, productType, propertyName } = parseCreditDesignation(body, afterBody);

  return {
    designation,
    productType,
    propertyName,
    echeanceAnnuelle,
    crd,
    dateFinCredit: amounts.dateFinCredit,
  };
}

function normalizeNom(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function parseEuroAmount(raw: string): number | undefined {
  const value = parseInt(raw.replace(/[\s,]/g, ""), 10);
  return Number.isFinite(value) && value > 0 ? value : undefined;
}

function extractPassifsBlock(text: string): string {
  const start = text.search(/\bPassifs\b/i);
  if (start < 0) return "";
  const end = text.search(/\bRevenus(?:\s+et\s+charges)?\b/i);
  return text.slice(start, end > start ? end : undefined);
}

/** Fusionne les lignes PDF coupées (désignation / emprunteur / montants sur plusieurs lignes). */
function flattenPassifsLines(block: string): string[] {
  const rows: string[] = [];
  let current = "";

  for (const rawLine of block.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || /^D[ée]signation\b/i.test(line)) continue;
    if (/^Recueil d'informations\b/i.test(line)) continue;
    if (/^TOTAL\b/i.test(line)) continue;

    if (/^Cr[ée]dits immobilier\b/i.test(line) && !/Amortissable/i.test(line)) {
      // Sous-total « Crédits immobilier  24045 €  410881 € » (montant juste après) → ignorer.
      if (/^Cr[ée]dits immobilier\s+[\d]/i.test(line)) continue;
      // Sinon c'est la désignation d'un bien (« Crédits immobilier - LMNP AIRBNB »)
      // reportée sous les montants : la rattacher au crédit courant.
      if (current) current += ` ${line}`;
      continue;
    }

    if (/Cr[ée]dit\s+immobilier\s*[-–—]\s*Amortissable/i.test(line)) {
      if (current) rows.push(current.trim());
      current = line;
      continue;
    }

    if (current) current += ` ${line}`;
  }

  if (current.trim()) rows.push(current.trim());
  return rows;
}

function extractCreditRows(block: string): string[] {
  const normalized = block.replace(/\r?\n/g, "\n");
  const physicalLines = flattenPassifsLines(normalized);
  const joined = physicalLines.join("\n");
  return joined
    .split(/(?=Cr[ée]dit\s+immobilier\s*[-–—]\s*Amortissable)/i)
    .map((part) => part.trim())
    .filter((part) => /Amortissable/i.test(part));
}

function parseDesignationTail(tail: string): { productType: string; propertyName: string } {
  const cleaned = tail.replace(/\s+/g, " ").trim();
  if (!cleaned) return { productType: "", propertyName: "" };

  const typedOnly = cleaned.match(new RegExp(`^(${PRODUCT_TYPES})$`, "i"));
  if (typedOnly) return { productType: typedOnly[1], propertyName: "" };

  const typedPrefix = cleaned.match(new RegExp(`^(${PRODUCT_TYPES})\\s+(.+)$`, "i"));
  if (typedPrefix) {
    return { productType: typedPrefix[1], propertyName: typedPrefix[2].trim() };
  }

  return { productType: "", propertyName: cleaned };
}

/** Lit les lignes crédit immo de l'onglet Passifs Stellium. */
export function parseStelliumPassifsMortgageCredits(text: string): StelliumMortgageCredit[] {
  const block = extractPassifsBlock(text);
  if (!block) return [];

  const credits: StelliumMortgageCredit[] = [];
  for (const row of extractCreditRows(block)) {
    const credit = parseCreditRow(row);
    if (credit && !normalizeNom(credit.productType).includes("scpi")) {
      credits.push(credit);
    }
  }
  return credits;
}

function namesMatch(a: string, b: string): boolean {
  const na = normalizeNom(a);
  const nb = normalizeNom(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 4 && nb.includes(na)) return true;
  if (nb.length >= 4 && na.includes(nb)) return true;
  return false;
}

function creditLabel(credit: StelliumMortgageCredit): string {
  return credit.propertyName || credit.designation || credit.productType;
}

function findCreditForLabel(
  label: string,
  credits: StelliumMortgageCredit[]
): StelliumMortgageCredit | undefined {
  return credits.find(
    (credit) =>
      namesMatch(label, credit.propertyName) ||
      namesMatch(label, credit.designation) ||
      namesMatch(label, creditLabel(credit))
  );
}

function findBienForLabel(label: string, biens: BienImmobilier[]): BienImmobilier | undefined {
  for (const bien of biens) {
    if (namesMatch(label, bien.nom)) return bien;
  }
  for (const bien of biens) {
    const bn = normalizeNom(bien.nom);
    const ln = normalizeNom(label);
    if (bn.length >= 6 && ln.includes(bn)) return bien;
    if (ln.length >= 6 && bn.includes(ln)) return bien;
  }
  return undefined;
}

function bienTypeMatchesProduct(bienType: string, productType: string): boolean {
  const type = bienType.toUpperCase();
  const product = normalizeNom(productType);
  if (!product) return true;
  if (product === "rp" || product.includes("residence")) {
    return type === "RESIDENCE_PRINCIPALE" || type === "RP";
  }
  if (product.includes("pinel")) return type === "PINEL";
  if (product.includes("classique")) return type === "LOCATIF" || type === "CLASSIQUE";
  if (product.includes("lmnp")) return type === "LMNP";
  return true;
}

function findBienForCredit(
  credit: StelliumMortgageCredit,
  biens: BienImmobilier[],
  usedIds: Set<string>
): BienImmobilier | undefined {
  const label = creditLabel(credit);
  const candidates = biens.filter((b) => !usedIds.has(b.id));

  for (const bien of candidates) {
    if (!bienTypeMatchesProduct(bien.type ?? "", credit.productType)) continue;
    if (namesMatch(label, bien.nom)) return bien;
  }

  for (const bien of candidates) {
    if (!bienTypeMatchesProduct(bien.type ?? "", credit.productType)) continue;
    const words = bien.nom.split(/[\s-]+/).filter((w) => w.length >= 4);
    if (words.some((w) => namesMatch(w, label))) return bien;
  }

  if (normalizeNom(credit.productType) === "rp") {
    const rpBiens = candidates.filter((b) => {
      const t = (b.type ?? "").toUpperCase();
      return t === "RESIDENCE_PRINCIPALE" || t === "RP";
    });
    if (rpBiens.length === 1) return rpBiens[0];
  }

  if (normalizeNom(credit.productType).includes("pinel")) {
    const pinelBiens = candidates.filter((b) => (b.type ?? "").toUpperCase() === "PINEL");
    if (pinelBiens.length === 1) return pinelBiens[0];
  }

  return undefined;
}

function applyMortgageCredit(bien: BienImmobilier, credit: StelliumMortgageCredit): void {
  bien.echeanceAnnuelle = credit.echeanceAnnuelle;
  bien.creditCRD = credit.crd;
  bien.mensualiteCredit = Math.round(credit.echeanceAnnuelle / 12);
  if (credit.dateFinCredit) bien.dateFinCredit = credit.dateFinCredit;
}

/**
 * Repli par mot-clé de type quand le libellé ne matche aucun nom de bien
 * (ex. « Crédit achat RP » sur un couple à emprunteurs scindés). Ne s'active
 * que s'il existe exactement UN bien du type visé encore sans financement.
 */
function findBienByTypeKeyword(
  label: string,
  biens: BienImmobilier[]
): BienImmobilier | undefined {
  const words = label.split(/[\s-]+/).map((w) => w.toLowerCase());
  const single = (types: string[]) => {
    const matches = biens.filter(
      (b) =>
        types.includes((b.type ?? "").toUpperCase()) &&
        !b.creditCRD &&
        !b.echeanceAnnuelle
    );
    return matches.length === 1 ? matches[0] : undefined;
  };
  if (words.includes("rp")) return single(["RESIDENCE_PRINCIPALE", "RP"]);
  if (words.includes("pinel")) return single(["PINEL"]);
  return undefined;
}

/**
 * Crédit immobilier COMMUN unique : un seul « Crédit immobilier - Amortissable »
 * dans les Passifs, dont les colonnes par emprunteur ne sont que des parts. Le
 * total (= sous-total puisqu'unique) donne l'échéance/CRD réels du crédit.
 */
function parseSingleCommonMortgage(
  fullText: string
): { echeance: number; crd: number; dateFinCredit?: string } | undefined {
  const block = extractPassifsBlock(fullText);
  if (!block) return undefined;
  const normalized = block.replace(/\t+/g, " ");

  const amortBlocks = normalized.match(
    /Cr[ée]dit\s+immobilier\s*[-–—]\s*Amortissable/gi
  );
  if (!amortBlocks || amortBlocks.length !== 1) return undefined;

  const totals =
    normalized.match(/\bTOTAL\b[^\d]*([\d\s,]+)\s*€\s+([\d\s,]+)\s*€/i) ??
    normalized.match(/Cr[ée]dits immobilier\s+([\d\s,]+)\s*€\s+([\d\s,]+)\s*€/i);
  if (!totals) return undefined;

  const echeance = parseEuroAmount(totals[1]);
  const crd = parseEuroAmount(totals[2]);
  if (!echeance || !crd) return undefined;

  const date = normalized.match(/(\d{2}\/\d{2}\/\d{4})/);
  return { echeance, crd, dateFinCredit: date?.[1] };
}

/** Secours : section Charges « Mensualité de crédit - Primo MTP » (libellé fiable). */
function applyCreditsFromMensualiteLines(
  fullText: string,
  biens: BienImmobilier[],
  credits: StelliumMortgageCredit[]
): void {
  const pattern =
    /Mensualit[ée]\s+de\s+cr[ée]dit\s*[-–—]\s*([^\d\n]+?)\s+([\d\s,]+)\s*€/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fullText)) !== null) {
    const label = match[1]
      .replace(/[\s\t-]+$/u, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!label || /^(Cr[ée]dits immobilier|SCPI)\b/i.test(label)) continue;

    const bien = findBienForLabel(
      label,
      biens.filter((b) => !b.creditCRD)
    );
    if (bien && !bien.creditCRD) {
      const credit = findCreditForLabel(label, credits);
      if (credit) {
        applyMortgageCredit(bien, credit);
        continue;
      }
      const echeance = parseEuroAmount(match[2]);
      if (echeance) {
        bien.echeanceAnnuelle = echeance;
        bien.mensualiteCredit = Math.round(echeance / 12);
      }
      continue;
    }

    // Repli par type : crédit nommé d'après le type (« Crédit achat RP ») dont
    // le crédit parsé serait partiel (emprunteurs scindés). Si un unique crédit
    // commun figure dans les Passifs, on en pose le total (échéance + CRD + date) ;
    // sinon on se rabat sur l'échéance fiable de la ligne Charges.
    const typedBien = findBienByTypeKeyword(label, biens);
    if (typedBien) {
      const common = parseSingleCommonMortgage(fullText);
      if (common) {
        typedBien.echeanceAnnuelle = common.echeance;
        typedBien.creditCRD = common.crd;
        typedBien.mensualiteCredit = Math.round(common.echeance / 12);
        if (common.dateFinCredit) typedBien.dateFinCredit = common.dateFinCredit;
      } else {
        const echeance = parseEuroAmount(match[2]);
        if (echeance) {
          typedBien.echeanceAnnuelle = echeance;
          typedBien.mensualiteCredit = Math.round(echeance / 12);
        }
      }
    }
  }
}

function applyStelliumRentalIncome(fullText: string, biens: BienImmobilier[]): void {
  const pattern =
    /Revenu\s+foncier(?:\s+ou\s+BIC)?\s*[-–—]\s*([^\d\n]+?)\s+([\d\s,]+)\s*€/gi;

  let match: RegExpExecArray | null;
  while ((match = pattern.exec(fullText)) !== null) {
    const label = match[1].replace(/\s+/g, " ").trim();
    const loyer = parseEuroAmount(match[2]);
    if (!label || loyer == null) continue;

    const labelNorm = normalizeNom(label);
    let bestBien: BienImmobilier | undefined;
    let bestScore = 0;

    for (const bien of biens) {
      const bienNorm = normalizeNom(bien.nom);
      let score = 0;
      if (labelNorm === bienNorm) score = 100;
      else {
        const labelWords = label.split(/[\s-]+/).map(normalizeNom).filter((w) => w.length >= 3);
        const bienWords = bien.nom.split(/[\s-]+/).map(normalizeNom).filter((w) => w.length >= 3);
        const matched = labelWords.filter((w) =>
          bienWords.some((bw) => bw === w || (w.length >= 4 && bw.includes(w)))
        );
        score = (matched.length / Math.max(labelWords.length, bienWords.length)) * 100;
      }
      if (score > bestScore) {
        bestScore = score;
        bestBien = bien;
      }
    }

    if (bestBien && bestScore >= 70) bestBien.loyersAnnuels = loyer;
  }
}

/** Complète crédits / loyers sur les biens déjà lus dans la section Actifs Stellium. */
export function enrichBiensImmobiliersWithCredits(
  fullText: string,
  biens?: BienImmobilier[]
): void {
  if (!biens?.length) return;

  const normalizedText = fullText.replace(/\t+/g, " ");
  const credits = parseStelliumPassifsMortgageCredits(normalizedText);
  const usedIds = new Set<string>();

  for (const credit of credits) {
    const bien = findBienForCredit(credit, biens, usedIds);
    if (!bien) continue;
    applyMortgageCredit(bien, credit);
    usedIds.add(bien.id);
  }

  applyCreditsFromMensualiteLines(normalizedText, biens, credits);
  applyStelliumRentalIncome(normalizedText, biens);
}
