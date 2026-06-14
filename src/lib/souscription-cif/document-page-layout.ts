/** Format A4 — dimensions communes à l'aperçu écran et à l'export PDF futur. */
export const CIF_DOCUMENT_PAGE_MM = {
  width: 210,
  height: 297,
  marginX: 20,
  marginTop: 20,
  marginBottom: 12,
  footerPaddingX: 15,
  footerPaddingY: 6,
} as const;

/** Coque page document (hauteur A4 fixe, pied de page en bas). */
export const cifDocumentPageClass =
  "mx-auto flex w-full max-w-[210mm] h-[297mm] min-h-[297mm] max-h-[297mm] flex-col overflow-hidden bg-white shadow-md";

/** Zone corps — occupe l'espace restant au-dessus du pied de page (pas de scroll). */
export const cifDocumentBodyClass =
  "min-h-0 flex-1 overflow-hidden px-[20mm] pt-[20mm] pb-[8mm]";

/** Corps document — 10 pt, interligne proche Word, paragraphes justifiés. */
export const cifDocumentBodyTextClass =
  "font-comfortaa text-[10pt] leading-[1.15] text-neutral-900 text-justify [text-align-last:left] hyphens-auto";

/** Bloc de texte corps (paragraphes préformatés). */
export const cifDocumentBodyProseClass = "whitespace-pre-wrap";

/** Pied de page document (bas de page A4). */
export const cifDocumentFooterClass =
  "shrink-0 border-t border-neutral-200 px-[15mm] py-[6mm] text-[7pt] leading-snug text-neutral-600 text-justify [text-align-last:left] hyphens-auto";

/** Titre centré (18 pt). */
export const cifDocumentTitleClass =
  "mb-[10mm] w-full text-center text-[18pt] font-bold tracking-tight [text-align-last:center]";

/** Sous-titre section produit centré (14 pt — entre corps 10 pt et titre 18 pt). */
export const cifDocumentSectionTitleClass =
  "my-[5mm] w-full text-center text-[14pt] font-semibold tracking-tight [text-align-last:center]";
