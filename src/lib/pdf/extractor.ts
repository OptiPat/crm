// Extraction de texte depuis les PDF natifs
import * as pdfjsLib from "pdfjs-dist";
import type { ExtractedText } from "./types";
import { readPdfFile } from "@/lib/api/tauri-pdf";

// Configuration du worker PDF.js pour Tauri
// Utiliser le worker local au lieu du CDN
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

/**
 * Extrait le texte d'un fichier PDF natif depuis un chemin de fichier (Tauri)
 * @param filePath Chemin du fichier PDF à analyser
 * @returns Texte extrait avec métadonnées
 */
export async function extractTextFromPDFPath(
  filePath: string
): Promise<ExtractedText> {
  try {
    // Lire le fichier via Tauri
    const uint8Array = await readPdfFile(filePath);
    const arrayBuffer = uint8Array.buffer;

    // Charger le document PDF
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = "";
    const numPages = pdf.numPages;

    // Extraire le texte de chaque page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Combiner tous les items de texte
      const pageText = textContent.items
        .map((item: any) => {
          // Certains items peuvent ne pas avoir de propriété 'str'
          if ("str" in item) {
            return item.str;
          }
          return "";
        })
        .join(" ");

      fullText += pageText + "\n\n"; // Séparer les pages
    }

    // Extraire les métadonnées
    const metadata = await pdf.getMetadata();
    const info = metadata.info;

    return {
      text: fullText.trim(),
      numPages,
      metadata: {
        title: info?.Title || undefined,
        author: info?.Author || undefined,
        subject: info?.Subject || undefined,
        keywords: info?.Keywords || undefined,
        creationDate: info?.CreationDate
          ? parsePDFDate(info.CreationDate)
          : undefined,
        modificationDate: info?.ModDate
          ? parsePDFDate(info.ModDate)
          : undefined,
      },
    };
  } catch (error) {
    console.error("Erreur lors de l'extraction du PDF:", error);
    throw new Error(
      `Impossible d'extraire le texte du PDF: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Extrait le texte d'un fichier PDF natif (avec texte sélectionnable)
 * @param file Fichier PDF à analyser
 * @returns Texte extrait avec métadonnées
 */
export async function extractTextFromPDF(
  file: File
): Promise<ExtractedText> {
  try {
    // Convertir le fichier en ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // Charger le document PDF
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;

    let fullText = "";
    const numPages = pdf.numPages;

    // Extraire le texte de chaque page
    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();

      // Combiner tous les items de texte
      const pageText = textContent.items
        .map((item: any) => {
          // Certains items peuvent ne pas avoir de propriété 'str'
          if ("str" in item) {
            return item.str;
          }
          return "";
        })
        .join(" ");

      fullText += pageText + "\n\n"; // Séparer les pages
    }

    // Extraire les métadonnées
    const metadata = await pdf.getMetadata();
    const info = metadata.info;

    return {
      text: fullText.trim(),
      numPages,
      metadata: {
        title: info?.Title || undefined,
        author: info?.Author || undefined,
        subject: info?.Subject || undefined,
        keywords: info?.Keywords || undefined,
        creationDate: info?.CreationDate
          ? parsePDFDate(info.CreationDate)
          : undefined,
        modificationDate: info?.ModDate
          ? parsePDFDate(info.ModDate)
          : undefined,
      },
    };
  } catch (error) {
    console.error("Erreur lors de l'extraction du PDF:", error);
    throw new Error(
      `Impossible d'extraire le texte du PDF: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}

/**
 * Vérifie si un fichier est un PDF
 * @param file Fichier à vérifier
 * @returns true si c'est un PDF
 */
export function isPDF(file: File): boolean {
  return (
    file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")
  );
}

/**
 * Parse une date au format PDF (D:YYYYMMDDHHmmSSOHH'mm')
 * @param pdfDate Date au format PDF
 * @returns Date JavaScript
 */
function parsePDFDate(pdfDate: string): Date | undefined {
  try {
    // Format: D:YYYYMMDDHHmmSSOHH'mm'
    if (pdfDate.startsWith("D:")) {
      const dateStr = pdfDate.substring(2, 16); // YYYYMMDDHHmmSS
      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1; // Les mois commencent à 0
      const day = parseInt(dateStr.substring(6, 8));
      const hour = parseInt(dateStr.substring(8, 10));
      const minute = parseInt(dateStr.substring(10, 12));
      const second = parseInt(dateStr.substring(12, 14));

      return new Date(year, month, day, hour, minute, second);
    }
    return undefined;
  } catch {
    return undefined;
  }
}

/**
 * Estime si un PDF contient du texte natif ou s'il est scanné
 * @param extractedText Texte extrait
 * @returns true si le PDF semble être du texte natif
 */
export function isNativeTextPDF(extractedText: string): boolean {
  // Si le texte extrait contient plus de 100 caractères,
  // c'est probablement un PDF avec du texte natif
  const cleanText = extractedText.trim();
  return cleanText.length > 100;
}

