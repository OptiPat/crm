/**
 * Diagnostic export CSV/Excel (contrats, perf…) — usage local uniquement.
 *
 * Affiche structure + échantillon ANONYMISÉ. Ne jamais committer les fichiers
 * sources : les déposer dans `_import_local/` (gitignored).
 *
 * Usage :
 *   npx tsx scripts/dump-import-csv.mts _import_local/Contrats_2026_06_21.csv
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import * as XLSX from "xlsx";

const fileArg = process.argv[2];
if (!fileArg) {
  console.error("Usage: npx tsx scripts/dump-import-csv.mts <fichier.csv|.xlsx>");
  process.exit(1);
}

const path = resolve(fileArg);
const ext = path.toLowerCase();

function anonymize(value: unknown, col: string): string {
  const s = String(value ?? "").trim();
  if (!s) return "";
  const colL = col.toLowerCase();
  if (
    colL.includes("titulaire") ||
    colL.includes("consultant") ||
    colL.includes("nom") ||
    colL.includes("prénom") ||
    colL.includes("prenom") ||
    colL.includes("email")
  ) {
    return colL.includes("consultant") ? "CONSEILLER" : "CLIENT_N";
  }
  if (colL.includes("n°") || colL.includes("identifiant") || colL.includes("contrat")) {
    if (/^\d+$/.test(s)) return "9990001";
    return "REF_ANON";
  }
  if (/^\d+[,.]\d+$/.test(s)) {
    const n = Number.parseFloat(s.replace(",", "."));
    if (Number.isFinite(n)) return (Math.round(n / 100) * 100).toFixed(2).replace(".", ",");
  }
  return s.length > 40 ? `${s.slice(0, 37)}…` : s;
}

function loadRows(filePath: string): { sheetName: string; rows: Record<string, unknown>[] } {
  if (filePath.endsWith(".csv")) {
    const raw = readFileSync(filePath, "utf8");
    const wb = XLSX.read(raw, { type: "string", raw: true, FS: ";" });
    const sheetName = wb.SheetNames[0] ?? "Sheet1";
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
    return { sheetName, rows };
  }
  const data = readFileSync(filePath);
  const wb = XLSX.read(data, { type: "buffer", raw: true });
  const sheetName = wb.SheetNames[0] ?? "Sheet1";
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[sheetName], {
    defval: "",
  });
  return { sheetName, rows };
}

const { sheetName, rows } = loadRows(path);
const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];

console.log("=== Fichier ===");
console.log(path);
console.log(`Feuille: ${sheetName}`);
console.log(`Lignes données: ${rows.length}`);
console.log(`Colonnes (${headers.length}):`);
for (const h of headers) console.log(`  - ${h}`);

const countBy = (key: string, limit = 12): void => {
  const counts = new Map<string, number>();
  for (const row of rows) {
    const v = String(row[key] ?? "").trim() || "(vide)";
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
  console.log(`\n=== Répartition « ${key} » (top ${limit}) ===`);
  for (const [v, n] of sorted) console.log(`  ${n}x  ${v}`);
};

if (headers.includes("Enveloppe")) countBy("Enveloppe");
if (headers.includes("Partenaire")) countBy("Partenaire", 8);
if (headers.includes("Contrat")) countBy("Contrat", 10);

const nonDispoCols = headers.filter((h) =>
  rows.some((r) => String(r[h] ?? "").trim() === "Non disponible")
);
if (nonDispoCols.length) {
  console.log("\n=== Colonnes avec « Non disponible » (au moins 1 ligne) ===");
  for (const col of nonDispoCols) {
    const n = rows.filter((r) => String(r[col] ?? "").trim() === "Non disponible").length;
    console.log(`  ${col}: ${n}/${rows.length}`);
  }
}

console.log("\n=== Échantillon anonymisé (3 premières lignes) ===");
for (const row of rows.slice(0, 3)) {
  const out: Record<string, string> = {};
  for (const h of headers) out[h] = anonymize(row[h], h);
  console.log(JSON.stringify(out, null, 0));
}
