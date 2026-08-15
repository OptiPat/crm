import { jsPDF } from "jspdf";
import { formatShortEuro } from "@/components/contacts/client-preview/client-preview-format";
import {
  buildSynthesePdfDownloadFilename,
  fitImageContain,
  SYNTHESE_PDF_LOGO_MAX_H_MM,
  SYNTHESE_PDF_LOGO_MAX_W_MM,
  SYNTHESE_PDF_SHARE_FILENAME,
  SYNTHESE_PDF_SUBTITLE,
  syntheseValoKindPrefix,
  type SynthesePdfChart,
  type SynthesePdfModel,
} from "./synthese-patrimoniale-pdf";

const PAGE_W = 210;
const PAGE_H = 297;
const MARGIN_X = 16;
const MARGIN_TOP = 16;
const MARGIN_BOTTOM = 16;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

function pdfText(value: string): string {
  return value
    .replace(/\u202f|\u00a0/g, " ")
    .replace(/[’‘]/g, "'")
    .replace(/[“”]/g, '"');
}

function euro(centimes: number): string {
  return pdfText(formatShortEuro(centimes));
}

function parseCssColor(color: string): [number, number, number] {
  const hex = color.trim();
  if (hex.startsWith("#")) {
    const h = hex.slice(1);
    if (h.length === 3) {
      return [
        parseInt(h[0] + h[0], 16),
        parseInt(h[1] + h[1], 16),
        parseInt(h[2] + h[2], 16),
      ];
    }
    if (h.length >= 6) {
      return [
        parseInt(h.slice(0, 2), 16),
        parseInt(h.slice(2, 4), 16),
        parseInt(h.slice(4, 6), 16),
      ];
    }
  }
  const rgb = color.match(/rgba?\((\d+)\s*,\s*(\d+)\s*,\s*(\d+)/);
  if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
  return [160, 160, 160];
}

function drawPie(
  doc: jsPDF,
  cx: number,
  cy: number,
  r: number,
  slices: SynthesePdfChart["slices"]
) {
  let angle = -Math.PI / 2;
  for (const slice of slices) {
    if (slice.percent <= 0) continue;
    const [red, green, blue] = parseCssColor(slice.color);
    doc.setFillColor(red, green, blue);
    if (slice.percent >= 99.95) {
      doc.circle(cx, cy, r, "F");
      return;
    }
    const sweep = (slice.percent / 100) * 2 * Math.PI;
    const steps = Math.max(8, Math.round(slice.percent));
    let prevX = cx + r * Math.cos(angle);
    let prevY = cy + r * Math.sin(angle);
    for (let i = 1; i <= steps; i++) {
      const a = angle + (sweep * i) / steps;
      const x = cx + r * Math.cos(a);
      const y = cy + r * Math.sin(a);
      doc.triangle(cx, cy, prevX, prevY, x, y, "F");
      prevX = x;
      prevY = y;
    }
    angle += sweep;
  }
}

async function loadLogo(
  url: string
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const format = /jpe?g/i.test(blob.type) ? "JPEG" : "PNG";
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return { dataUrl, format };
  } catch {
    return null;
  }
}

function ensureY(doc: jsPDF, y: number, need: number): number {
  if (y + need <= PAGE_H - MARGIN_BOTTOM) return y;
  doc.addPage();
  return MARGIN_TOP;
}

export function synthesePdfDownloadFilename(model: SynthesePdfModel): string {
  return buildSynthesePdfDownloadFilename({
    prenom: model.clientPrenom,
    nom: model.clientNom,
    dateLabel: model.generatedLabel,
  });
}

/** Aperçu d'abord sur téléphone ; téléchargement direct sur ordi. */
export function synthesePdfOpensPreview(input: {
  framed: boolean;
  viewport?: "mobile" | "desktop";
  viewportWidthPx: number;
}): boolean {
  if (input.framed) return input.viewport === "mobile";
  return input.viewportWidthPx < 768;
}

export async function buildSynthesePatrimonialePdfBytes(
  model: SynthesePdfModel
): Promise<Uint8Array> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const right = PAGE_W - MARGIN_X;
  let y = MARGIN_TOP;

  const logo = model.logoUrl ? await loadLogo(model.logoUrl) : null;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(107, 107, 107);
  doc.text(pdfText(model.generatedLabel), MARGIN_X, y);

  let headerBottom = y + 2;
  if (logo) {
    const props = doc.getImageProperties(logo.dataUrl);
    const { width: logoW, height: logoH } = fitImageContain(
      props.width,
      props.height,
      SYNTHESE_PDF_LOGO_MAX_W_MM,
      SYNTHESE_PDF_LOGO_MAX_H_MM
    );
    const logoY = y - 4;
    doc.addImage(logo.dataUrl, logo.format, right - logoW, logoY, logoW, logoH);
    headerBottom = Math.max(headerBottom, logoY + logoH);
  }

  y = headerBottom + 6;
  if (model.clientName) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(16);
    doc.setTextColor(17, 17, 17);
    doc.text(pdfText(model.clientName), MARGIN_X, y);
    y += 7;
  }
  doc.setFont("helvetica", "normal");
  doc.setFontSize(11);
  doc.setTextColor(51, 51, 51);
  doc.text(pdfText(model.subtitle), MARGIN_X, y);
  y += 4;
  doc.setDrawColor(17, 17, 17);
  doc.setLineWidth(0.18);
  doc.line(MARGIN_X, y, right, y);
  y += 8;

  if (model.totalCentimes > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(17, 17, 17);
    doc.text(
      pdfText(`Patrimoine total estimé ${euro(model.totalCentimes)}`),
      MARGIN_X,
      y
    );
    y += 8;
  }

  if (model.charts.length > 0) {
    const chartW = (CONTENT_W - 8) / Math.min(model.charts.length, 2);
    const pieR = 12;
    let chartBottom = y;
    model.charts.forEach((chart, index) => {
      const colX = MARGIN_X + index * (chartW + 8);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      doc.setTextColor(68, 68, 68);
      doc.text(pdfText(chart.title.toUpperCase()), colX, y);
      const pieCx = colX + pieR;
      const pieCy = y + 6 + pieR;
      drawPie(doc, pieCx, pieCy, pieR, chart.slices);
      let legendY = y + 8;
      const swatchX = colX + pieR * 2 + 6;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(7.5);
      for (const slice of chart.slices) {
        const [red, green, blue] = parseCssColor(slice.color);
        doc.setFillColor(red, green, blue);
        doc.circle(swatchX, legendY - 1.2, 1.1, "F");
        doc.setTextColor(51, 51, 51);
        doc.text(pdfText(slice.name), swatchX + 3, legendY);
        doc.setTextColor(17, 17, 17);
        doc.text(
          `${slice.percent} %  ${euro(slice.valueCentimes)}`,
          colX + chartW,
          legendY,
          { align: "right" }
        );
        legendY += 4.4;
      }
      chartBottom = Math.max(chartBottom, pieCy + pieR, legendY);
    });
    y = chartBottom + 4;
    doc.setDrawColor(221, 221, 221);
    doc.setLineWidth(0.15);
    doc.line(MARGIN_X, y, right, y);
    y += 8;
  }

  for (const group of model.groups) {
    y = ensureY(doc, y, 14);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(17, 17, 17);
    doc.text(pdfText(group.category.toUpperCase()), MARGIN_X, y);
    y += 2;
    doc.setDrawColor(17, 17, 17);
    doc.setLineWidth(0.18);
    doc.line(MARGIN_X, y, right, y);
    y += 6;

    for (const item of group.items) {
      const valoH = item.valorisations.length * 4;
      y = ensureY(doc, y, 12 + valoH);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(17, 17, 17);
      const titleLines = doc.splitTextToSize(pdfText(item.title), CONTENT_W - 42);
      doc.text(titleLines, MARGIN_X, y);
      doc.setFont("helvetica", "bold");
      doc.text(euro(item.amountCentimes), right, y, { align: "right" });
      y += titleLines.length * 4.2;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(85, 85, 85);
      const rightMeta = [
        item.encoursDateLabel,
        item.originDateLabel,
      ].filter((line): line is string => Boolean(line));
      if (item.subtitle) {
        doc.text(pdfText(item.subtitle), MARGIN_X, y);
      }
      rightMeta.forEach((line, index) => {
        doc.text(pdfText(line), right, y + index * 3.8, { align: "right" });
      });
      y += Math.max(item.subtitle ? 1 : 0, rightMeta.length) * 3.8;
      for (const valo of item.valorisations) {
        const prefix = syntheseValoKindPrefix(valo.kind);
        const left = prefix ? `${prefix}  ${valo.dateLabel}` : valo.dateLabel;
        doc.setTextColor(85, 85, 85);
        doc.text(pdfText(left), MARGIN_X, y);
        doc.text(euro(valo.montantCentimes), right, y, { align: "right" });
        y += 3.8;
      }
      doc.setDrawColor(238, 238, 238);
      doc.setLineWidth(0.12);
      doc.line(MARGIN_X, y, right, y);
      y += 5;
    }
    y += 2;
  }

  if (model.legalLines.length > 0) {
    y = ensureY(doc, y, 16);
    y += 2;
    doc.setDrawColor(204, 204, 204);
    doc.setLineWidth(0.15);
    doc.line(MARGIN_X, y, right, y);
    y += 5;
    model.legalLines.forEach((line, index) => {
      const size = index < 2 ? 8 : 6.5;
      doc.setFont("helvetica", index === 0 ? "bold" : "normal");
      doc.setFontSize(size);
      doc.setTextColor(index < 2 ? 17 : 119, index < 2 ? 17 : 119, index < 2 ? 17 : 119);
      const wrapped = doc.splitTextToSize(pdfText(line), CONTENT_W);
      const blockH = wrapped.length * (size * 0.42 + 0.6);
      y = ensureY(doc, y, blockH + 1);
      doc.text(wrapped, MARGIN_X, y);
      y += blockH;
    });
  }

  return new Uint8Array(doc.output("arraybuffer"));
}

function uint8ToArrayBuffer(bytes: Uint8Array): ArrayBuffer {
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  return copy;
}

export function triggerPdfDownload(bytes: Uint8Array, filename: string): void {
  const blob = new Blob([uint8ToArrayBuffer(bytes)], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

export function isShareCancellation(error: unknown): boolean {
  return Boolean(
    error &&
      typeof error === "object" &&
      "name" in error &&
      (error as { name: string }).name === "AbortError"
  );
}

type ShareNavigator = Navigator & {
  share?: (data: { files?: File[]; title?: string }) => Promise<void>;
  canShare?: (data: { files?: File[] }) => boolean;
};

export function canSharePdfFile(file: File): boolean {
  const nav = navigator as ShareNavigator;
  if (typeof nav.share !== "function") return false;
  if (typeof nav.canShare !== "function") return true;
  try {
    return nav.canShare({ files: [file] });
  } catch {
    return false;
  }
}

/** Feuille native (Mail, Fichiers, Messages…) — nom de fichier sans identité. */
export async function shareOrDownloadPdf(
  bytes: Uint8Array,
  downloadFilename: string
): Promise<void> {
  const file = new File([uint8ToArrayBuffer(bytes)], SYNTHESE_PDF_SHARE_FILENAME, {
    type: "application/pdf",
  });
  const nav = navigator as ShareNavigator;
  if (canSharePdfFile(file) && nav.share) {
    try {
      await nav.share({
        files: [file],
        title: SYNTHESE_PDF_SUBTITLE,
      });
      return;
    } catch (error) {
      if (isShareCancellation(error)) return;
    }
  }
  triggerPdfDownload(bytes, downloadFilename);
}

export async function downloadSynthesePatrimonialePdf(
  model: SynthesePdfModel
): Promise<void> {
  const bytes = await buildSynthesePatrimonialePdfBytes(model);
  triggerPdfDownload(bytes, synthesePdfDownloadFilename(model));
}

export async function shareOrDownloadSynthesePatrimonialePdf(
  model: SynthesePdfModel
): Promise<void> {
  const bytes = await buildSynthesePatrimonialePdfBytes(model);
  await shareOrDownloadPdf(bytes, synthesePdfDownloadFilename(model));
}
