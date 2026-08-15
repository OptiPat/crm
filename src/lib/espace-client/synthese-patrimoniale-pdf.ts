import type { Investissement } from "@/lib/api/tauri-investissements";
import type { Partenaire } from "@/lib/api/tauri-partenaires";
import { getEffectiveEncoursCentimes } from "@/lib/investissements/investissement-encours";
import { distributeIntegerPercents } from "@/lib/patrimoine/chart-percents";
import {
  getPatrimoineCategorie,
  PATRIMOINE_CATEGORIE_ORDER,
  type PatrimoineCategorie,
} from "@/lib/patrimoine/categories";
import type { PatrimoineChartSlice } from "@/lib/patrimoine/patrimoine-charts";
import type { ValorisationHistoryById } from "./espace-valorisations";
import {
  inventoryOriginDatePrefix,
  inventoryRowLabels,
} from "./client-inventory-labels";

export const SYNTHESE_VALO_LIMIT = 5;

/** Boîte max du logo PDF (mm) — même ratio que l'aperçu, sans étirer. */
export const SYNTHESE_PDF_LOGO_MAX_W_MM = 28;
export const SYNTHESE_PDF_LOGO_MAX_H_MM = 16;

/** Réduit une image dans une boîte en conservant le ratio (object-fit: contain). */
export function fitImageContain(
  naturalW: number,
  naturalH: number,
  maxW: number,
  maxH: number
): { width: number; height: number } {
  if (!(naturalW > 0) || !(naturalH > 0) || !(maxW > 0) || !(maxH > 0)) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(maxW / naturalW, maxH / naturalH);
  return {
    width: Math.round(naturalW * scale * 1000) / 1000,
    height: Math.round(naturalH * scale * 1000) / 1000,
  };
}

const MONTHS_FR = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
] as const;

export function formatSyntheseDate(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getUTCDate()} ${MONTHS_FR[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

/** Date du jour d'export (calendrier local — pas UTC). */
export function formatSyntheseLocalDate(unix: number): string {
  const d = new Date(unix * 1000);
  return `${d.getDate()} ${MONTHS_FR[d.getMonth()]} ${d.getFullYear()}`;
}

export function splitLegalLines(raw?: string | null): string[] {
  if (!raw) return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

export function legalLinesFromPrivacy(privacy: {
  controller?: string | null;
  controllerDetails?: string | null;
}): string[] {
  const details = splitLegalLines(privacy.controllerDetails);
  const controller = privacy.controller?.trim();
  if (controller && !details.some((line) => line === controller)) {
    return [controller, ...details];
  }
  return details;
}

export function legalLinesFromPrivacyAndAdvisor(
  privacy: {
    controller?: string | null;
    controllerDetails?: string | null;
  },
  advisor?: {
    prenom?: string | null;
    nom?: string | null;
    telephone?: string | null;
  } | null
): string[] {
  const identity = [advisor?.prenom?.trim(), advisor?.nom?.trim()]
    .filter(Boolean)
    .join(" ");
  return prependAdvisorIdentity(
    legalLinesFromPrivacy(privacy),
    identity,
    advisor?.telephone
  );
}

function foldLegalLine(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function phoneDigits(value: string): string {
  return value.replace(/\D/g, "");
}

function lineIsIdentity(line: string, name: string): boolean {
  if (!name) return false;
  return foldLegalLine(line) === foldLegalLine(name);
}

function lineIsPhone(line: string, telephone: string): boolean {
  const digits = phoneDigits(telephone);
  if (digits.length < 6) return false;
  return phoneDigits(line) === digits;
}

/**
 * Identité puis téléphone en tête, même si la signature les a dans un autre
 * ordre (le téléphone était souvent la première ligne).
 */
export function prependAdvisorIdentity(
  body: string[],
  identity?: string | null,
  telephone?: string | null
): string[] {
  const name = identity?.trim() ?? "";
  const tel = telephone?.trim() ?? "";
  const rest = body.filter(
    (line) => !lineIsIdentity(line, name) && !lineIsPhone(line, tel)
  );
  const header: string[] = [];
  if (name) header.push(name);
  if (tel) header.push(tel);
  return [...header, ...rest];
}

export function legalLinesFromCgpConfig(cgp: {
  nom?: string | null;
  prenom?: string | null;
  cabinet?: string | null;
  telephone?: string | null;
  adresse?: string | null;
  code_postal?: string | null;
  ville?: string | null;
  cif_siren?: string | null;
  cif_orias?: string | null;
  cif_anacofi_numero?: string | null;
  email_signature?: string | null;
}): string[] {
  const identity = [cgp.prenom?.trim(), cgp.nom?.trim()]
    .filter(Boolean)
    .join(" ");
  const fromSignature = splitLegalLines(cgp.email_signature);
  if (fromSignature.length > 0) {
    return prependAdvisorIdentity(fromSignature, identity, cgp.telephone);
  }

  const lines: string[] = [];
  const header = cgp.cabinet?.trim() || identity;
  if (header) lines.push(header);
  if (identity && header !== identity) lines.push(identity);
  if (cgp.telephone?.trim()) lines.push(cgp.telephone.trim());
  const city = [cgp.code_postal?.trim(), cgp.ville?.trim()]
    .filter(Boolean)
    .join(" ");
  const address = [cgp.adresse?.trim(), city].filter(Boolean).join(", ");
  if (address) lines.push(address);
  if (cgp.cif_siren?.trim()) lines.push(`SIREN ${cgp.cif_siren.trim()}`);
  if (cgp.cif_orias?.trim()) {
    lines.push(
      `Inscrit à l'ORIAS sous le n° ${cgp.cif_orias.trim()} (www.orias.fr)`
    );
  }
  if (cgp.cif_anacofi_numero?.trim()) {
    lines.push(
      `Conseiller en Investissements Financiers, membre de l'ANACOFI-CIF n° ${cgp.cif_anacofi_numero.trim()}`
    );
  }
  return lines;
}

export function lastValorisations(
  points: Array<{ dateTs: number; montantCentimes: number }> | undefined,
  limit = SYNTHESE_VALO_LIMIT
): Array<{ dateTs: number; montantCentimes: number }> {
  if (!points?.length) return [];
  return [...points]
    .filter((p) => p.montantCentimes > 0 && p.dateTs > 0)
    .sort((a, b) => b.dateTs - a.dateTs)
    .slice(0, limit);
}

function utcDay(unix: number): number {
  return Math.floor(unix / 86_400);
}

export type SynthesePdfValoKind = "achat" | "souscription" | "valorisation";

export function synthesePurchaseKind(
  categorie: PatrimoineCategorie
): Exclude<SynthesePdfValoKind, "valorisation"> {
  return categorie === "Immobilier" ? "achat" : "souscription";
}

export function syntheseValoKindPrefix(kind: SynthesePdfValoKind): string | null {
  if (kind === "achat") return "Prix d'achat";
  if (kind === "souscription") return "Souscription";
  return null;
}

/** Prix d'achat / souscription (montant_initial) + 5 dernières valorisations. */
export function buildInvestmentValorisations(
  inv: Pick<Investissement, "montant_initial" | "date_souscription">,
  history: Array<{ dateTs: number; montantCentimes: number }> | undefined,
  categorie: PatrimoineCategorie,
  limit = SYNTHESE_VALO_LIMIT
): SynthesePdfValo[] {
  const purchaseKind = synthesePurchaseKind(categorie);
  const purchase =
    inv.montant_initial != null &&
    inv.montant_initial > 0 &&
    inv.date_souscription != null &&
    inv.date_souscription > 0
      ? {
          dateTs: inv.date_souscription,
          montantCentimes: inv.montant_initial,
          kind: purchaseKind,
        }
      : null;

  const recent = lastValorisations(history, limit).filter((point) => {
    if (!purchase) return true;
    if (utcDay(point.dateTs) !== utcDay(purchase.dateTs)) return true;
    return point.montantCentimes !== purchase.montantCentimes;
  });

  const rows: SynthesePdfValo[] = [];
  if (purchase) {
    rows.push({
      dateLabel: formatSyntheseDate(purchase.dateTs),
      montantCentimes: purchase.montantCentimes,
      kind: purchase.kind,
    });
  }
  for (const point of [...recent].reverse()) {
    rows.push({
      dateLabel: formatSyntheseDate(point.dateTs),
      montantCentimes: point.montantCentimes,
      kind: "valorisation",
    });
  }
  return rows;
}

/** Évite de répéter le montant déjà affiché à droite de la ligne. */
export function omitRedundantCurrentValorisation(
  rows: SynthesePdfValo[],
  amountCentimes: number
): SynthesePdfValo[] {
  if (amountCentimes <= 0 || rows.length === 0) return rows;
  const last = rows[rows.length - 1];
  if (last.kind === "valorisation" && last.montantCentimes === amountCentimes) {
    return rows.slice(0, -1);
  }
  return rows;
}

export interface SynthesePdfChartSlice {
  name: string;
  color: string;
  percent: number;
  valueCentimes: number;
}

export interface SynthesePdfChart {
  title: string;
  totalCentimes: number;
  slices: SynthesePdfChartSlice[];
}

export interface SynthesePdfValo {
  dateLabel: string;
  montantCentimes: number;
  kind: SynthesePdfValoKind;
}

export interface SynthesePdfInvestment {
  id: number;
  title: string;
  subtitle: string | null;
  amountCentimes: number;
  originDateLabel: string | null;
  encoursDateLabel: string | null;
  valorisations: SynthesePdfValo[];
}

export interface SynthesePdfGroup {
  category: PatrimoineCategorie;
  items: SynthesePdfInvestment[];
}

export const SYNTHESE_PDF_SUBTITLE = "Synthèse patrimoniale";
export const SYNTHESE_PDF_SHARE_FILENAME = "Synthese-patrimoniale.pdf";

export interface SynthesePdfModel {
  clientName: string;
  clientNom: string;
  clientPrenom: string;
  subtitle: string;
  generatedLabel: string;
  logoUrl?: string | null;
  totalCentimes: number;
  charts: SynthesePdfChart[];
  groups: SynthesePdfGroup[];
  legalLines: string[];
}

export function buildSynthesePdfClientName(
  prenom?: string | null,
  nom?: string | null
): string {
  return [prenom?.trim(), nom?.trim()].filter(Boolean).join(" ");
}

const INVALID_FILENAME_CHARS = /[\\/:*?"<>|\u0000-\u001f\u007f]/g;

function sanitizeFilenamePart(value: string): string {
  return value
    .replace(INVALID_FILENAME_CHARS, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Nom du fichier au téléchargement seulement (pas au partage).
 * Ordre français : nom puis prénom. Date déjà en français.
 */
export function buildSynthesePdfDownloadFilename(input: {
  prenom?: string | null;
  nom?: string | null;
  dateLabel: string;
}): string {
  const identity = sanitizeFilenamePart(
    [input.nom?.trim(), input.prenom?.trim()].filter(Boolean).join(" ")
  );
  const date = sanitizeFilenamePart(input.dateLabel);
  const core = identity
    ? `Synthèse patrimoniale - ${identity} - ${date}`
    : date
      ? `Synthèse patrimoniale - ${date}`
      : "Synthèse patrimoniale";
  return `${core}.pdf`;
}

function toChart(
  title: string,
  slices: PatrimoineChartSlice[]
): SynthesePdfChart | null {
  const positive = slices.filter((s) => s.value > 0);
  if (positive.length === 0) return null;
  const percents = distributeIntegerPercents(positive.map((s) => s.value));
  return {
    title,
    totalCentimes: positive.reduce((sum, s) => sum + s.value, 0),
    slices: positive.map((s, i) => ({
      name: s.name,
      color: s.color,
      percent: percents[i] ?? 0,
      valueCentimes: s.value,
    })),
  };
}

function originDateLabel(inv: Investissement): string | null {
  if (!inv.date_souscription) return null;
  const prefix = inventoryOriginDatePrefix(
    getPatrimoineCategorie(inv.type_produit)
  );
  return `${prefix} ${formatSyntheseDate(inv.date_souscription)}`;
}

export function buildSynthesePatrimonialePdfModel(input: {
  prenom?: string | null;
  nom?: string | null;
  totalCentimes: number;
  categorieData: PatrimoineChartSlice[];
  disponibiliteData: PatrimoineChartSlice[];
  investissements: Investissement[];
  partenaireById: Map<number, Partenaire>;
  historiesByInvestissementId?: ValorisationHistoryById;
  legalLines: string[];
  logoUrl?: string | null;
  nowUnix?: number;
}): SynthesePdfModel {
  const charts = [
    toChart("Par catégorie", input.categorieData),
    toChart("Par horizon", input.disponibiliteData),
  ].filter((c): c is SynthesePdfChart => c != null);

  const grouped = new Map<PatrimoineCategorie, Investissement[]>();
  for (const inv of input.investissements) {
    const cat = getPatrimoineCategorie(inv.type_produit);
    const list = grouped.get(cat) ?? [];
    list.push(inv);
    grouped.set(cat, list);
  }

  const groups: SynthesePdfGroup[] = [];
  for (const category of PATRIMOINE_CATEGORIE_ORDER) {
    const items = grouped.get(category);
    if (!items?.length) continue;
    const sorted = [...items].sort(
      (a, b) => getEffectiveEncoursCentimes(b) - getEffectiveEncoursCentimes(a)
    );
    groups.push({
      category,
      items: sorted.map((inv) => {
        const partenaire =
          inv.partenaire_id != null
            ? input.partenaireById.get(inv.partenaire_id)
            : undefined;
        const labels = inventoryRowLabels({
          typeProduit: inv.type_produit,
          nomProduit: inv.nom_produit,
          partenaireNom: partenaire?.raison_sociale,
        });
        const amountCentimes = getEffectiveEncoursCentimes(inv);
        return {
          id: inv.id,
          title: labels.title,
          subtitle: labels.subtitle,
          amountCentimes,
          originDateLabel: originDateLabel(inv),
          encoursDateLabel: inv.encours_date
            ? `Au ${formatSyntheseDate(inv.encours_date)}`
            : null,
          valorisations: omitRedundantCurrentValorisation(
            buildInvestmentValorisations(
              inv,
              input.historiesByInvestissementId?.get(inv.id),
              category
            ),
            amountCentimes
          ),
        };
      }),
    });
  }

  const nowUnix = input.nowUnix ?? Math.floor(Date.now() / 1000);
  return {
    clientName: buildSynthesePdfClientName(input.prenom, input.nom),
    clientNom: input.nom?.trim() ?? "",
    clientPrenom: input.prenom?.trim() ?? "",
    subtitle: SYNTHESE_PDF_SUBTITLE,
    generatedLabel: formatSyntheseLocalDate(nowUnix),
    logoUrl: input.logoUrl?.trim() || null,
    totalCentimes: input.totalCentimes,
    charts,
    groups,
    legalLines: input.legalLines,
  };
}

/** Tranches de camembert (0° = 12 h). Un disque plein si 100 %. */
export function pieSlicePath(
  cx: number,
  cy: number,
  r: number,
  startRad: number,
  endRad: number
): string {
  const span = endRad - startRad;
  if (span >= 2 * Math.PI - 1e-6) {
    return `M ${cx - r} ${cy} A ${r} ${r} 0 1 1 ${cx + r} ${cy} A ${r} ${r} 0 1 1 ${cx - r} ${cy} Z`;
  }
  const x1 = cx + r * Math.cos(startRad);
  const y1 = cy + r * Math.sin(startRad);
  const x2 = cx + r * Math.cos(endRad);
  const y2 = cy + r * Math.sin(endRad);
  const large = span > Math.PI ? 1 : 0;
  return `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
}

export function pieSlicePaths(
  slices: Array<{ percent: number; color: string }>,
  cx = 40,
  cy = 40,
  r = 36
): Array<{ d: string; color: string }> {
  const start = -Math.PI / 2;
  let angle = start;
  const paths: Array<{ d: string; color: string }> = [];
  for (const slice of slices) {
    if (slice.percent <= 0) continue;
    const sweep = (slice.percent / 100) * 2 * Math.PI;
    paths.push({
      d: pieSlicePath(cx, cy, r, angle, angle + sweep),
      color: slice.color,
    });
    angle += sweep;
  }
  return paths;
}
