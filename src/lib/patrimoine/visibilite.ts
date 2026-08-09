export type FoyerRole = "DECLARANT_1" | "DECLARANT_2" | "ENFANT" | "AUTRE" | string;

export interface PatrimoineViewer {
  id: number;
  foyer_id?: number | null;
  role_foyer?: FoyerRole | null;
  /** Timestamp Unix secondes (naissance). */
  date_naissance?: number | null;
}

export interface FoyerMemberRef {
  id: number;
  role_foyer?: FoyerRole | null;
  date_naissance?: number | null;
}

export interface PatrimoineInvestissement {
  contact_id?: number | null;
  foyer_id?: number | null;
  statut?: string | null;
}

const PARENT_ROLES = new Set(["DECLARANT_1", "DECLARANT_2"]);

function isParentRole(role?: FoyerRole | null): boolean {
  return role != null && PARENT_ROLES.has(role);
}

function isDeclarantRole(role?: FoyerRole | null): boolean {
  return role === "DECLARANT_1" || role === "DECLARANT_2";
}

function computeAgeYears(dateNaissanceUnix: number, refUnix: number): number {
  const birth = new Date(dateNaissanceUnix * 1000);
  const ref = new Date(refUnix * 1000);
  let age = ref.getFullYear() - birth.getFullYear();
  const m = ref.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && ref.getDate() < birth.getDate())) {
    age -= 1;
  }
  return age;
}

export function isContactMinorAt(
  dateNaissance: number | null | undefined,
  refUnix: number
): boolean {
  if (dateNaissance == null || dateNaissance <= 0) return false;
  return computeAgeYears(dateNaissance, refUnix) < 18;
}

function isCommonFoyerInvestment(inv: PatrimoineInvestissement): boolean {
  return inv.foyer_id != null && (inv.contact_id == null || inv.contact_id <= 0);
}

function sameFoyer(
  viewer: PatrimoineViewer,
  inv: PatrimoineInvestissement
): boolean {
  return (
    viewer.foyer_id != null &&
    inv.foyer_id != null &&
    viewer.foyer_id === inv.foyer_id
  );
}

function findMember(
  members: FoyerMemberRef[],
  contactId: number
): FoyerMemberRef | undefined {
  return members.find((m) => m.id === contactId);
}

function isOwnerInViewerFoyer(
  ownerId: number,
  viewer: PatrimoineViewer,
  foyerMembers: FoyerMemberRef[]
): boolean {
  if (viewer.foyer_id == null) return false;
  return foyerMembers.some((m) => m.id === ownerId);
}

function isMinorChildMember(
  owner: FoyerMemberRef,
  refUnix: number
): boolean {
  if (owner.role_foyer !== "ENFANT") return false;
  if (owner.date_naissance == null || owner.date_naissance <= 0) {
    // Sans date de naissance, rien ne distingue un enfant de 10 ans d'un enfant
    // majeur de 25 ans : exposer ses avoirs aux parents serait le même incident
    // que le cas conjoint. Le conseiller renseigne la date pour rendre visible.
    return false;
  }
  return isContactMinorAt(owner.date_naissance, refUnix);
}

function isSpousePersonalInvestment(
  viewer: PatrimoineViewer,
  ownerId: number,
  members: FoyerMemberRef[]
): boolean {
  if (!isDeclarantRole(viewer.role_foyer)) return false;
  const owner = findMember(members, ownerId);
  if (!owner || !isDeclarantRole(owner.role_foyer)) return false;
  return owner.id !== viewer.id;
}

/**
 * R2 — Cloisonnement conjugal : ce qu'une personne voit dans son espace client.
 * En cas de doute : invisible.
 */
export function isInvestissementVisibleToViewer(
  inv: PatrimoineInvestissement,
  viewer: PatrimoineViewer,
  foyerMembers: FoyerMemberRef[],
  options?: { nowUnix?: number; includeCloture?: boolean }
): boolean {
  if (inv.statut === "CLOTURE" && !options?.includeCloture) {
    return false;
  }

  const now = options?.nowUnix ?? Math.floor(Date.now() / 1000);

  if (inv.contact_id === viewer.id) {
    return true;
  }

  if (isCommonFoyerInvestment(inv) && sameFoyer(viewer, inv)) {
    return true;
  }

  const ownerId = inv.contact_id;
  if (ownerId == null || ownerId <= 0) {
    return false;
  }

  if (!isOwnerInViewerFoyer(ownerId, viewer, foyerMembers)) {
    return false;
  }

  if (
    inv.foyer_id != null &&
    viewer.foyer_id != null &&
    inv.foyer_id !== viewer.foyer_id
  ) {
    return false;
  }

  const owner = findMember(foyerMembers, ownerId);
  if (!owner) {
    return false;
  }

  if (owner.role_foyer === "ENFANT" && isParentRole(viewer.role_foyer)) {
    return isMinorChildMember(owner, now);
  }

  if (isSpousePersonalInvestment(viewer, ownerId, foyerMembers)) {
    return false;
  }

  return false;
}

export function filterInvestissementsVisibleToViewer<
  T extends PatrimoineInvestissement,
>(
  investissements: T[],
  viewer: PatrimoineViewer,
  foyerMembers: FoyerMemberRef[],
  options?: { nowUnix?: number; includeCloture?: boolean }
): T[] {
  return investissements.filter((inv) =>
    isInvestissementVisibleToViewer(inv, viewer, foyerMembers, options)
  );
}
