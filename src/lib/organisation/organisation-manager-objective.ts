import { parseFilleulQualification, parseFilleulTitre } from "@/lib/organisation/filleul-ranks";

/** Objectif cumulatif branche pour passer Manager (Junior / Consultant). */
export const ORGANISATION_MANAGER_VOLUME_TARGET = 500_000;

export type ManagerObjectiveStatus = "target_met" | "below_target" | "not_applicable";

const MANAGER_TITRE_IDS = new Set(["MANAGER", "SENIOR", "MAJOR", "EXPERT"]);

/** Badge Manager affiché (titre Manager+ ou qualification Manager). */
export function hasManagerRankBadge(
  filleulTitre?: string | null,
  filleulQualification?: string | null
): boolean {
  const titreId = parseFilleulTitre(filleulTitre);
  if (titreId != null && MANAGER_TITRE_IDS.has(titreId)) return true;
  return parseFilleulQualification(filleulQualification) === "MANAGER";
}

/** Junior / Consultant sans badge Manager : éligible à l'objectif cumul. */
export function isManagerObjectiveEligible(
  filleulTitre?: string | null,
  filleulQualification?: string | null
): boolean {
  if (hasManagerRankBadge(filleulTitre, filleulQualification)) return false;
  const titreId = parseFilleulTitre(filleulTitre);
  if (titreId == null) return true;
  return titreId === "JUNIOR" || titreId === "CONSULTANT";
}

export function getManagerObjectiveStatus(
  cumulativeBranchVolume: number,
  eligible: boolean
): ManagerObjectiveStatus {
  if (!eligible) return "not_applicable";
  if (cumulativeBranchVolume >= ORGANISATION_MANAGER_VOLUME_TARGET) return "target_met";
  return "below_target";
}
