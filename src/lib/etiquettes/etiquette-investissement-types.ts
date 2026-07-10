/** Types de produits alignés sur InvestissementForm (étiquettes auto TYPE_PRODUIT / investissement). */

export const INVESTISSEMENT_TYPE_GROUPS: { label: string; types: { value: string; label: string }[] }[] = [
  {
    label: "SCPI",
    types: [
      { value: "SCPI", label: "SCPI" },
      { value: "SCPI_DEMEMBREMENT", label: "SCPI démembrement" },
      { value: "SCPI_FISCALE", label: "SCPI fiscale" },
    ],
  },
  {
    label: "Placements",
    types: [
      { value: "ASSURANCE_VIE", label: "Assurance-vie" },
      { value: "PER", label: "PER" },
      { value: "FIP_FCPI", label: "FIP / FCPI" },
      { value: "FCPR", label: "FCPR / FPCI" },
      { value: "CONTRAT_CAPITALISATION", label: "Contrat de capitalisation" },
      { value: "EPARGNE_SALARIALE", label: "Épargne salariale" },
      { value: "G3F", label: "G3F" },
    ],
  },
  {
    label: "Immobilier",
    types: [
      { value: "IMMOBILIER", label: "Immobilier" },
      { value: "PINEL", label: "Pinel" },
      { value: "DENORMANDIE", label: "Denormandie" },
      { value: "JEANBRUN", label: "Jeanbrun" },
      { value: "BESSON", label: "Besson" },
      { value: "SCELLIER", label: "Scellier" },
      { value: "ROBIEN", label: "Robien" },
      { value: "MEHAIGNERIE", label: "Méhaignerie" },
      { value: "PERISSOL", label: "Périssol" },
      { value: "DUFLOT", label: "Duflot" },
      { value: "BORLOO", label: "Borloo" },
      { value: "MALRAUX", label: "Malraux" },
      { value: "MONUMENT_HISTORIQUE", label: "Monument historique" },
      { value: "DEFICIT_FONCIER", label: "Déficit foncier" },
      { value: "LMNP", label: "LMNP" },
      { value: "LMP", label: "LMP" },
      { value: "NUE_PROPRIETE", label: "Nue-propriété" },
      { value: "RESIDENCE_PRINCIPALE", label: "Résidence principale" },
      { value: "LOCATIF_CLASSIQUE", label: "Locatif classique" },
    ],
  },
  {
    label: "Autre",
    types: [{ value: "AUTRE", label: "Autre" }],
  },
];

export const ALL_INVESTISSEMENT_TYPE_VALUES = INVESTISSEMENT_TYPE_GROUPS.flatMap((g) =>
  g.types.map((t) => t.value)
);
