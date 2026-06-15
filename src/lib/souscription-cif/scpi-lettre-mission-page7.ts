/** Page 7 — Lettre de mission SCPI (articles 14 à 17). */

export const SCPI_LM_PAGE7_BODY = `[u]14. Droit de rétractation[/u]

Dans l'hypothèse où la conclusion de la présente Lettre de Mission fait suite à un acte de démarchage bancaire et financier au sens de l'article L. 341-1 du Code monétaire et financier, le Client dispose d'un délai de rétractation de quatorze (14) jours à compter de la signature des présentes.

[u]15. Réclamations Client – Médiation[/u]

Pour toute réclamation concernant la Prestation, le Client s'adresse préalablement et sur support durable au Conseiller. Le Conseiller s'engage à traiter la réclamation dans les conditions détaillées dans le DER. Le DER comporte également toutes les informations relatives au médiateur compétent, si le Client souhaite y avoir recours en vue de la résolution amiable du litige qui l'oppose au Conseiller.

[u]16. Durée du Contrat – Entrée en vigueur - Dénonciation[/u]

La présente Lettre de Mission est conclue à compter de sa date de signature par les Parties pour une durée indéterminée susceptible de faire l'objet d'avenants, notamment en cas d'évolution du droit. Elle peut être résiliée à tout moment par tout moyen par le Client avec un préavis de huit (8) jours à compter de la réception.

[u]17. Droit applicable et tribunaux compétents[/u]

Les dispositions de la présente Lettre de Mission sont régies et soumises au droit français.

Tout litige relatif à l'exécution ou à l'interprétation de la présente Lettre de Mission pourra être soumis à médiation pour rechercher une solution amiable avant tout recours à une procédure judiciaire, dans les conditions fixées par l'article 15 de la présente Lettre de Mission.

À défaut, ces litiges seront soumis aux tribunaux compétents dans le ressort duquel se situe le siège social du Conseiller.
`;

/** Colonne gauche — bloc signatures (exemplaire Conseiller). */
export const SCPI_LM_PAGE7_SIGNATURE_LEFT = `Fait le {{date_document}}
À {{client_ville}}

Un exemplaire original pour le Conseiller

Le CIF : {{cgp_nom_complet}}
Signature


`;

/** Colonne droite — bloc signatures (exemplaire Client). */
export const SCPI_LM_PAGE7_SIGNATURE_RIGHT = `Fait le {{date_document}}
À {{client_ville}}

Un exemplaire original pour le Client

Par {{client_nom_prenom}}
Signature(s)




`;
