import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  ComptaDepense,
  ComptaDeplacement,
  ComptaEncaissement,
} from "@/lib/api/tauri-compta";
import { formatComptaMoneyPdf } from "@/lib/compta/compta-money";
import { formatComptaDateFr, formatComptaMonthLabel } from "@/lib/compta/compta-month";

export interface ComptaPdfExportInput {
  year: number;
  month: number;
  ownerLabel: string;
  depenses: ComptaDepense[];
  encaissements: ComptaEncaissement[];
  deplacements: ComptaDeplacement[];
}

export function exportComptaJournalPdf(input: ComptaPdfExportInput): void {
  const doc = new jsPDF();

  const monthTitle = formatComptaMonthLabel(input.year, input.month);
  const depenses = [...input.depenses].sort((a, b) => a.date.localeCompare(b.date));
  const encaissements = [...input.encaissements].sort((a, b) =>
    a.date.localeCompare(b.date)
  );
  const deplacements = [...input.deplacements].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  const totalEnc = encaissements.reduce((sum, e) => sum + e.total, 0);
  const totalDep = depenses.reduce((sum, d) => sum + d.ttc, 0);
  const totalKm = deplacements.reduce((sum, d) => sum + d.indemnite, 0);
  const totalKmDistance = deplacements.reduce((sum, d) => sum + d.km, 0);
  const tvaCollectee = encaissements.reduce((sum, e) => sum + e.tva, 0);
  const tvaDeductible = depenses.reduce((sum, d) => sum + d.tva, 0);
  const totalDons = encaissements.reduce((sum, e) => sum + e.don, 0);
  const totalHTDep = depenses.reduce((sum, d) => sum + d.ht, 0);

  let yPos = 20;

  doc.setFontSize(16);
  doc.setTextColor(30, 30, 30);
  doc.text(`Journal Comptable - ${input.ownerLabel}`, 105, yPos, { align: "center" });
  yPos += 8;

  doc.setFontSize(12);
  doc.setTextColor(100, 100, 100);
  doc.text(monthTitle, 105, yPos, { align: "center" });
  yPos += 15;

  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text("ENCAISSEMENTS", 14, yPos);
  yPos += 2;

  const encData = encaissements.map((e) => [
    formatComptaDateFr(e.date),
    e.client,
    formatComptaMoneyPdf(e.exonere),
    formatComptaMoneyPdf(e.ht),
    formatComptaMoneyPdf(e.tva),
    formatComptaMoneyPdf(e.total),
    e.don > 0 ? formatComptaMoneyPdf(e.don) : "-",
    e.lienDrive ? "Voir" : "-",
  ]);
  const encLinks = encaissements.map((e) => e.lienDrive || null);

  encData.push([
    "TOTAL",
    "",
    formatComptaMoneyPdf(encaissements.reduce((s, e) => s + e.exonere, 0)),
    formatComptaMoneyPdf(encaissements.reduce((s, e) => s + e.ht, 0)),
    formatComptaMoneyPdf(tvaCollectee),
    formatComptaMoneyPdf(totalEnc),
    formatComptaMoneyPdf(totalDons),
    "",
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["Date", "Client", "Exonéré", "HT", "TVA", "Total reçu", "Don", "Justif."]],
    body: encData,
    theme: "grid",
    headStyles: { fillColor: [16, 185, 129], textColor: 255, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 40 },
      2: { cellWidth: 18, halign: "right" },
      3: { cellWidth: 18, halign: "right" },
      4: { cellWidth: 16, halign: "right" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 16, halign: "right" },
      7: { cellWidth: 18, halign: "center" },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 7 && data.row.index < encLinks.length) {
        const link = encLinks[data.row.index];
        if (link) {
          doc.setTextColor(0, 102, 204);
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });
        }
      }
    },
    willDrawCell: (data) => {
      if (data.section === "body" && data.row.index === encData.length - 1) {
        doc.setFont("helvetica", "bold");
      }
    },
  });

  yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (yPos > 200) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(11);
  doc.setTextColor(30, 30, 30);
  doc.text("DEPENSES", 14, yPos);
  yPos += 2;

  const depData = depenses.map((d) => [
    formatComptaDateFr(d.date),
    d.categorie,
    d.tiers,
    formatComptaMoneyPdf(d.ht),
    formatComptaMoneyPdf(d.tva),
    formatComptaMoneyPdf(d.ttc),
    d.lienDrive ? "Voir" : "-",
  ]);
  const depLinks = depenses.map((d) => d.lienDrive || null);

  depData.push([
    "TOTAL",
    "",
    "",
    formatComptaMoneyPdf(totalHTDep),
    formatComptaMoneyPdf(tvaDeductible),
    formatComptaMoneyPdf(totalDep),
    "",
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["Date", "Catégorie", "Tiers", "HT", "TVA", "TTC", "Justif."]],
    body: depData,
    theme: "grid",
    headStyles: { fillColor: [239, 68, 68], textColor: 255, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 28 },
      2: { cellWidth: 45 },
      3: { cellWidth: 20, halign: "right" },
      4: { cellWidth: 18, halign: "right" },
      5: { cellWidth: 22, halign: "right" },
      6: { cellWidth: 18, halign: "center" },
    },
    didDrawCell: (data) => {
      if (data.section === "body" && data.column.index === 6 && data.row.index < depLinks.length) {
        const link = depLinks[data.row.index];
        if (link) {
          doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: link });
        }
      }
    },
    willDrawCell: (data) => {
      if (data.section === "body" && data.row.index === depData.length - 1) {
        doc.setFont("helvetica", "bold");
      }
    },
  });

  yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10;

  if (yPos > 200) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(11);
  doc.text("DEPLACEMENTS", 14, yPos);
  yPos += 2;

  const deplData = deplacements.map((d) => [
    formatComptaDateFr(d.date),
    d.destination,
    d.objet,
    `${d.km.toFixed(1)} km`,
    formatComptaMoneyPdf(d.indemnite),
  ]);

  deplData.push([
    "TOTAL",
    "",
    "",
    `${totalKmDistance.toFixed(1)} km`,
    formatComptaMoneyPdf(totalKm),
  ]);

  autoTable(doc, {
    startY: yPos,
    head: [["Date", "Destination", "Objet", "Distance", "Indemnité"]],
    body: deplData,
    theme: "grid",
    headStyles: { fillColor: [59, 130, 246], textColor: 255, fontStyle: "bold", fontSize: 8 },
    styles: { fontSize: 7, cellPadding: 2 },
    columnStyles: {
      0: { cellWidth: 18 },
      1: { cellWidth: 55 },
      2: { cellWidth: 50 },
      3: { cellWidth: 22, halign: "right" },
      4: { cellWidth: 25, halign: "right" },
    },
    willDrawCell: (data) => {
      if (data.section === "body" && data.row.index === deplData.length - 1) {
        doc.setFont("helvetica", "bold");
      }
    },
  });

  yPos = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 15;

  if (yPos > 240) {
    doc.addPage();
    yPos = 20;
  }

  doc.setFontSize(11);
  doc.text("RECAPITULATIF", 14, yPos);
  yPos += 2;

  autoTable(doc, {
    startY: yPos,
    body: [
      ["Encaissements (total reçu)", formatComptaMoneyPdf(totalEnc)],
      ["Dépenses (TTC)", formatComptaMoneyPdf(totalDep)],
      ["Indemnités kilométriques", formatComptaMoneyPdf(totalKm)],
      ["Dons effectués", formatComptaMoneyPdf(totalDons)],
      ["TVA collectée", formatComptaMoneyPdf(tvaCollectee)],
      ["TVA déductible", formatComptaMoneyPdf(tvaDeductible)],
      ["TVA nette (à reverser)", formatComptaMoneyPdf(tvaCollectee - tvaDeductible)],
    ],
    theme: "grid",
    styles: { fontSize: 9, cellPadding: 4 },
    columnStyles: {
      0: { cellWidth: 100, fontStyle: "bold" },
      1: { cellWidth: 50, halign: "right" },
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(150, 150, 150);
    doc.text(
      `Page ${i}/${pageCount} - Généré le ${new Date().toLocaleDateString("fr-FR")}`,
      105,
      290,
      { align: "center" }
    );
  }

  const filename = `Journal Comptable - ${input.ownerLabel} - ${monthTitle.replace(" ", "_")}.pdf`;
  doc.save(filename);
}
