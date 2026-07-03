/** Titres et qualifications réseau filleul (Organisation). */

export const FILLEUL_TITRES = [
  "JUNIOR",
  "CONSULTANT",
  "MANAGER",
  "SENIOR",
  "MAJOR",
  "EXPERT",
] as const;

export const FILLEUL_QUALIFICATIONS = [
  "MANAGER",
  "PLANETE",
  "ETOILE",
  "CONSTELLATION",
  "GALAXIE",
] as const;

export type FilleulTitre = (typeof FILLEUL_TITRES)[number];
export type FilleulQualification = (typeof FILLEUL_QUALIFICATIONS)[number];

export type RankIconKind =
  | "none"
  | "inuksuk-red"
  | "star-copper"
  | "stars-2-silver"
  | "stars-3-gold"
  | "inuksuk-dark"
  | "inuksuk-copper"
  | "inuksuk-silver"
  | "inuksuk-gold";

export type FilleulTitreMeta = {
  id: FilleulTitre;
  label: string;
  icon: RankIconKind;
};

export type FilleulQualificationMeta = {
  id: FilleulQualification;
  label: string;
  icon: RankIconKind;
};

export const FILLEUL_TITRE_META: Record<FilleulTitre, FilleulTitreMeta> = {
  JUNIOR: { id: "JUNIOR", label: "Junior", icon: "none" },
  CONSULTANT: { id: "CONSULTANT", label: "Consultant", icon: "none" },
  MANAGER: { id: "MANAGER", label: "Manager", icon: "inuksuk-red" },
  SENIOR: { id: "SENIOR", label: "Senior", icon: "star-copper" },
  MAJOR: { id: "MAJOR", label: "Major", icon: "stars-2-silver" },
  EXPERT: { id: "EXPERT", label: "Expert", icon: "stars-3-gold" },
};

export const FILLEUL_QUALIFICATION_META: Record<
  FilleulQualification,
  FilleulQualificationMeta
> = {
  MANAGER: { id: "MANAGER", label: "Manager", icon: "inuksuk-red" },
  PLANETE: { id: "PLANETE", label: "Planète", icon: "inuksuk-dark" },
  ETOILE: { id: "ETOILE", label: "Étoile", icon: "inuksuk-copper" },
  CONSTELLATION: { id: "CONSTELLATION", label: "Constellation", icon: "inuksuk-silver" },
  GALAXIE: { id: "GALAXIE", label: "Galaxie", icon: "inuksuk-gold" },
};

export function parseFilleulTitre(value?: string | null): FilleulTitre | null {
  if (!value) return null;
  return (FILLEUL_TITRES as readonly string[]).includes(value) ? (value as FilleulTitre) : null;
}

export function parseFilleulQualification(
  value?: string | null
): FilleulQualification | null {
  if (!value) return null;
  return (FILLEUL_QUALIFICATIONS as readonly string[]).includes(value)
    ? (value as FilleulQualification)
    : null;
}

export function getFilleulTitreLabel(value?: string | null): string | null {
  const id = parseFilleulTitre(value);
  return id ? FILLEUL_TITRE_META[id].label : null;
}

export function getFilleulQualificationLabel(value?: string | null): string | null {
  const id = parseFilleulQualification(value);
  return id ? FILLEUL_QUALIFICATION_META[id].label : null;
}
