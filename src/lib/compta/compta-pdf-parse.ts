import { roundComptaMoney } from "@/lib/compta/compta-money";

const EN_MONTHS: Record<string, string> = {
  january: "01",
  february: "02",
  march: "03",
  april: "04",
  may: "05",
  june: "06",
  july: "07",
  august: "08",
  september: "09",
  october: "10",
  november: "11",
  december: "12",
};

const FR_MONTHS: Record<string, string> = {
  janvier: "01",
  fevrier: "02",
  février: "02",
  mars: "03",
  avril: "04",
  mai: "05",
  juin: "06",
  juillet: "07",
  aout: "08",
  août: "08",
  septembre: "09",
  octobre: "10",
  novembre: "11",
  decembre: "12",
  décembre: "12",
};

export function parseFrenchAmount(raw: string): number | null {
  const cleaned = raw
    .replace(/\u00a0/g, " ")
    .replace(/\s/g, "")
    .replace(/€/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return roundComptaMoney(n);
}

/** Montant avec point décimal (USD, Stripe, Sonar). */
export function parseDecimalAmount(raw: string): number | null {
  const cleaned = raw.replace(/\u00a0/g, " ").replace(/\s/g, "").replace(/[$€]/g, "");
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return null;
  return roundComptaMoney(n);
}

export function findLabeledAmount(text: string, patterns: RegExp[]): number | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const value = parseFrenchAmount(match[1]) ?? parseDecimalAmount(match[1]);
      if (value != null) return value;
    }
  }
  return null;
}

export function normalizeComptaPdfText(text: string): string {
  return text.replace(/\r/g, "\n").replace(/\t/g, " ");
}

export function extractComptaDateFromText(text: string, fileName: string): string {
  const isoFromName = fileName.match(/(20\d{2})[-_](\d{2})[-_](\d{2})/);
  if (isoFromName) {
    return `${isoFromName[1]}-${isoFromName[2]}-${isoFromName[3]}`;
  }

  const emissionIso = text.match(/date\s*d['’]émission\s+(\d{4}-\d{2}-\d{2})/i);
  if (emissionIso) return emissionIso[1]!;

  const invoiceDate = text.match(
    /(?:date\s*(?:de\s*)?(?:facture|facturation|commerciale)|factur[ée]\s*le|[ée]mis\s+le)\s*:?\s*(\d{2})[/.-](\d{2})[/.-](20\d{2})/i
  );
  if (invoiceDate) {
    return `${invoiceDate[3]}-${invoiceDate[2]}-${invoiceDate[1]}`;
  }

  const enDate = text.match(
    /(?:Date of issue|Date due|Date)\s+([A-Za-z]+)\s+(\d{1,2}),?\s+(20\d{2})/i
  );
  if (enDate) {
    const month = EN_MONTHS[enDate[1]!.toLowerCase()];
    if (month) {
      return `${enDate[3]}-${month}-${enDate[2]!.padStart(2, "0")}`;
    }
  }

  const frNamed = text.match(
    /(\d{1,2})\s+(janvier|f[eé]vrier|mars|avril|mai|juin|juillet|ao[uû]t|septembre|octobre|novembre|d[eé]cembre)\s+(20\d{2})/i
  );
  if (frNamed) {
    const monthKey = frNamed[2]!
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const month = FR_MONTHS[monthKey] ?? FR_MONTHS[frNamed[2]!.toLowerCase()];
    if (month) {
      return `${frNamed[3]}-${month}-${frNamed[1]!.padStart(2, "0")}`;
    }
  }

  const cityDate = text.match(/[àa]\s+[^,\n]+,\s*[ée]mis\s+le\s+(\d{2})[/.-](\d{2})[/.-](20\d{2})/i);
  if (cityDate) {
    return `${cityDate[3]}-${cityDate[2]}-${cityDate[1]}`;
  }

  const fr = text.match(/(\d{2})[/.-](\d{2})[/.-](20\d{2})/);
  if (fr) {
    return `${fr[3]}-${fr[2]}-${fr[1]}`;
  }

  const iso = text.match(/(20\d{2})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  return new Date().toISOString().split("T")[0]!;
}
