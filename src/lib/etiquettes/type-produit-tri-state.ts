/** Filtres tri-état sur investissements ciblés (TYPE_PRODUIT, campagnes éphémères). */
export type TypeProduitTriStateFilter = "any" | "inactive" | "active";

export type ProduitsMatchMode = "all" | "any";

export type TypeProduitConditionOptions = {
  types: string[];
  nomsProduit: string[];
  produitsMatchMode?: ProduitsMatchMode;
  reinvestissementDividendes?: TypeProduitTriStateFilter;
  versementProgramme?: TypeProduitTriStateFilter;
};
