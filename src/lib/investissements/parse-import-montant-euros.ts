import { parseEuroInput } from "@/lib/souscription-cif/build-annexes-scpi-costs";

/** Montant Excel formaté (espaces milliers, virgule décimale ou séparateur de milliers). */
export function parseImportMontantEuros(raw: string): number | null {
  let s = raw
    .trim()
    .replace(/\u00a0|\u202f/g, " ")
    .replace(/€/g, "")
    .trim();
  if (!s) return null;

  if (/\d\s+\d/.test(s)) {
    const compact = s.replace(/\s+/g, "");
    const normalized = compact.includes(",")
      ? compact.replace(/\./g, "").replace(",", ".")
      : compact;
    const n = Number.parseFloat(normalized);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  const compact = s.replace(/\s+/g, "");

  if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(compact)) {
    const n = Number.parseFloat(compact.replace(/,/g, ""));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(compact)) {
    const n = Number.parseFloat(compact.replace(/\./g, "").replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  return parseEuroInput(s);
}
