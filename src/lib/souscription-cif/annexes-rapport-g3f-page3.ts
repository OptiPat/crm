/** § 6 — Annexes Girardin industriel (G3F) : cadre client, calcul investissement, plafond niches. */

const ANNEXES_G3F_SECTION6_PARAGRAPHS = [
  "[u]Cadre réservé au client[/u]",
  `✓ Je reconnais que la présentation des opérations dites « Girardin industriel » est réalisée dans le cadre de la fourniture de conseils en gestion de patrimoine par {{cgp_nom_complet}} et que je n'ai pas fait l'objet d'un acte de démarchage bancaire et financier au sens de l'article L.341-1 du CMF.`,
  `✓ Je suis intéressé par un investissement dans une opération dite « Girardin industriel » et souhaite être mis en relation avec le partenaire afin de poursuivre l'étude de l'opportunité d'investissement.`,
  "[u]Calcul de l'investissement[/u]",
  "Calcul du montant d'apport nécessaire",
  `Vous estimez votre impôt sur le revenu {{g3f_annee_impot}} à {{g3f_montant_impot}} € avant réduction et crédit d'impôt.`,
  `Vous souhaitez une réduction d'impôt sur le revenu de {{g3f_montant_reduction_souhaitee}} €
- Montant de l'apport nécessaire : {{g3f_montant_apport}} €
- Frais de l'enregistrement : environ {{g3f_frais_enregistrement}} €
- Total de l'apport : environ {{g3f_total_apport}} €`,
  "[u]Recalcul du plafond :[/u]",
  `Le montant d'investissement proposé respecte donc le plafond global des niches fiscales et permet en même temps de baisser votre impôt.`,
  `Vous avez été informé qu'en application de la loi de finances pour {{g3f_annee_loi_finances}} que les souscriptions réalisées en {{g3f_annee_souscription}} pour des opérations en LODEOM seront prises en compte lors de la déclaration de revenus {{g3f_annee_declaration_revenus}} faite en avril/mai {{g3f_annee_declaration_revenus}} et restituées à l'été {{g3f_annee_declaration_revenus}} et tenant compte de l'éventuel impôt dû sur les revenus exceptionnels.`,
  `Vous reconnaissez que si le montant du revenu imposable pouvant bénéficier de la réduction d'impôt susvisée est inférieur, il ne sera pas possible de demander la révision du montant de la souscription de façon rétroactive. Enfin, si le montant de la réduction d'impôt excède l'impôt dû, l'excédent constituera une créance sur l'État d'égal montant pouvant le cas échéant être reporté sur 5 ans dans la limite des plafonds fixés par la loi.`,
] as const;

export const ANNEXES_G3F_SECTION6_BODY = ANNEXES_G3F_SECTION6_PARAGRAPHS.join("\n\n");
