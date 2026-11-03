/** Associations professionnelles CIF proposées dans les Paramètres (agréées par l'AMF). */
export type AssociationCifId = "anacofi" | "cncef";

type AssociationCif = {
  /** Libellé du menu Paramètres. */
  label: string;
  /** Avec article, corps des documents : « auprès de l'Anacofi CIF ». */
  nom: string;
  /** Avec article, pied de page légal : « membre n° … de l'ANACOFI – CIF ». */
  nomPiedDePage: string;
  /** L'association délivre un n° d'adhérent cité dans les documents. */
  avecNumero: boolean;
};

export const ASSOCIATIONS_CIF: Record<AssociationCifId, AssociationCif> = {
  anacofi: {
    label: "ANACOFI-CIF",
    nom: "l'Anacofi CIF",
    nomPiedDePage: "l'ANACOFI – CIF",
    avecNumero: true,
  },
  cncef: {
    label: "CNCEF Patrimoine",
    nom: "la CNCEF Patrimoine",
    nomPiedDePage: "la CNCEF Patrimoine",
    avecNumero: false,
  },
};

export const ASSOCIATION_CIF_DEFAUT: AssociationCifId = "anacofi";

/** Valeur absente ou inconnue → Anacofi (comportement historique). */
export function resolveAssociationCif(value?: string | null): AssociationCif {
  const id = value && value in ASSOCIATIONS_CIF ? (value as AssociationCifId) : ASSOCIATION_CIF_DEFAUT;
  return ASSOCIATIONS_CIF[id];
}

export type AssociationCifMentions = {
  /** En-tête lettre / rapport de mission : « enregistré sous le n°… auprès de l'Anacofi CIF ». */
  adhesion: string | null;
  /** Convention RTO : « auprès de l'Anacofi CIF (n° …) ». */
  aupres: string | null;
  /** Pied de page : « membre n° … de l'ANACOFI – CIF ». */
  membre: string | null;
};

/**
 * Formules citant l'association dans les documents CIF.
 * Association à numéro sans numéro saisi → `null` (champ signalé manquant à l'aperçu).
 */
export function associationCifMentions(
  value: string | null | undefined,
  numero: string | null | undefined
): AssociationCifMentions {
  const association = resolveAssociationCif(value);
  const n = numero?.trim() || null;
  if (!association.avecNumero) {
    return {
      adhesion: `adhérent de ${association.nom}`,
      aupres: `auprès de ${association.nom}`,
      membre: `membre de ${association.nomPiedDePage}`,
    };
  }
  if (!n) return { adhesion: null, aupres: null, membre: null };
  return {
    adhesion: `enregistré sous le n°${n} auprès de ${association.nom}`,
    aupres: `auprès de ${association.nom} (n° ${n})`,
    membre: `membre n° ${n} de ${association.nomPiedDePage}`,
  };
}
