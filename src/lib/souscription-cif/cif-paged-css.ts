import { CIF_DOCUMENT_PAGE_MM } from "@/lib/souscription-cif/document-page-layout";

/**
 * Feuille de style CSS Paged Media (consommée par Paged.js) — pagination native A4.
 *
 * Les utilitaires Tailwind appliqués au contenu cloné restent actifs (même document) ;
 * cette feuille ne fait qu'ajouter les règles de fragmentation, les marges `@page`
 * et le pied de page courant répété sur chaque page.
 */
export const CIF_PAGED_MARGIN_BOTTOM_MM = 34;

export function buildCifPagedCss(): string {
  const { marginX, marginTop } = CIF_DOCUMENT_PAGE_MM;
  return `
/* Marges latérales @page à 0 : la boîte @bottom-center (pied de page) occupe alors
   toute la largeur A4 (210 mm) — filet pleine largeur comme la lettre de mission.
   Le retrait latéral du corps (marginX) est reporté en padding sur .cif-paged-flow
   (recréé sur chaque page par Paged.js via rebuildAncestors). */
@page {
  size: A4 portrait;
  margin: ${marginTop}mm 0 ${CIF_PAGED_MARGIN_BOTTOM_MM}mm 0;
  @bottom-center {
    width: 100%;
    content: element(cifRunningFooter);
  }
}

.cif-paged-flow {
  padding: 0 ${marginX}mm;
  font-size: 10pt;
  line-height: 1.15;
}

/* Pied de page courant : sorti du flux, répété dans la marge basse de chaque page.
   Style aligné sur celui de la lettre de mission (cifDocumentFooterClass) :
   filet fin neutral-200, texte gris neutral-600 7 pt, interligne leading-snug,
   justifié avec césure. */
.cif-running-footer {
  position: running(cifRunningFooter);
  width: 100%;
  border-top: 1px solid rgb(229 229 229);
  /* Padding vertical symétrique (haut = bas), comme py-6mm de cifDocumentFooterClass :
     combiné au centrage vertical de la boîte @bottom-center (align-items:center),
     le texte est centré dans son pied de page, identique à la lettre de mission. */
  padding: ${CIF_DOCUMENT_PAGE_MM.footerPaddingY}mm ${CIF_DOCUMENT_PAGE_MM.footerPaddingX}mm;
  font-size: 7pt;
  line-height: 1.375;
  color: rgb(82 82 82);
  text-align: justify;
  text-align-last: left;
  hyphens: auto;
}

/* Saut de page dur entre sections rédigées (ex. page de garde -> tableau récap). */
.cif-page-break {
  break-before: page;
}

.cif-flow-section {
  break-inside: auto;
}

/* Tableau récapitulatif : en-tête répété en haut de chaque page, lignes longues fragmentables. */
.cif-rm-recap-table {
  break-inside: auto;
}
.cif-rm-recap-table thead {
  display: table-header-group;
}
.cif-rm-recap-table tr {
  break-inside: auto;
}

/* Le bloc signatures reste groupé (jamais coupé entre conseiller et client). */
.cif-signature-block {
  break-inside: avoid;
}

/* Pas de titre orphelin en bas de page. */
.cif-paged-flow h2,
.cif-paged-flow h3 {
  break-after: avoid;
}

/* À l'écran on garde le surlignage ambre des variables manquantes ;
   à l'impression on le retire (document final). */
@media print {
  .cif-paged-flow mark {
    background: transparent;
    padding: 0;
  }
}
`.trim();
}
