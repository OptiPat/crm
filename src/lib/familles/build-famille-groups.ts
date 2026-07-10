import type { Contact } from "@/lib/api/tauri-contacts";
import type { Famille } from "@/lib/api/tauri-familles";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { getRolePriority } from "@/lib/familles/famille-roles";
import type {
  FamilleGroup,
  MemberWithInvestments,
} from "@/lib/familles/famille-types";
import { getContactPatrimoine } from "@/lib/investissements/contact-patrimoine";

const ENFANT_ROLE_FAMILLE = new Set([
  "FILS",
  "FILLE",
  "PETIT_FILS",
  "PETITE_FILLE",
]);

function isFoyerConjointForFamilleDisplay(
  person: Contact,
  anchor: Contact,
  groupNom: string,
  coreMemberIds: ReadonlySet<number>
): boolean {
  if (person.id != null && coreMemberIds.has(person.id)) {
    return false;
  }
  if (person.role_foyer === "ENFANT") {
    return false;
  }
  if (person.role_famille && ENFANT_ROLE_FAMILLE.has(person.role_famille)) {
    return false;
  }
  if (person.role_famille === "CONJOINT" || person.role_foyer === "DECLARANT_2") {
    return true;
  }
  if (anchor.role_foyer === "DECLARANT_1" && person.role_foyer === "DECLARANT_2") {
    return true;
  }
  return person.nom.trim().toUpperCase() !== groupNom;
}

function isFoyerEnfantForFamilleDisplay(
  person: Contact,
  coreMemberIds: ReadonlySet<number>
): boolean {
  if (person.id != null && coreMemberIds.has(person.id)) {
    return false;
  }
  if (person.role_foyer === "ENFANT") {
    return true;
  }
  return Boolean(
    person.role_famille && ENFANT_ROLE_FAMILLE.has(person.role_famille)
  );
}

function buildMembresWithInvests(
  membres: Contact[],
  groupNom: string,
  eligible: Contact[],
  investissementsByContact: Record<number, Investissement[]>,
  investissementsByFoyer: Record<number, Investissement[]>,
  includeSpouses: boolean
): MemberWithInvestments[] {
  const membresSorted = [...membres].sort(
    (a, b) => getRolePriority(a.role_famille) - getRolePriority(b.role_famille)
  );
  const coreMemberIds = new Set(
    membres.map((m) => m.id).filter((id): id is number => id != null)
  );
  const membresWithInvests: MemberWithInvestments[] = [];
  const spousesAdded = new Set<number>();
  const foyerChildrenAdded = new Set<number>();

  membresSorted.forEach((membre) => {
    const data = getContactPatrimoine(
      membre,
      investissementsByContact,
      investissementsByFoyer
    );

    membresWithInvests.push({
      contact: membre,
      investissements: data.investissements,
      patrimoine: data.total,
      patrimoinePerso: data.patrimoinePerso,
      patrimoineCommun: data.patrimoineCommun,
      avecMoiPerso: data.avecMoiPerso,
      avecMoiCommun: data.avecMoiCommun,
      avecMoiTotal: data.avecMoiTotal,
      isSpouse: false,
    });

    if (!includeSpouses || !membre.foyer_id) return;

    const foyerMembers = eligible.filter(
      (c) => c.foyer_id === membre.foyer_id && c.id !== membre.id
    );
    foyerMembers.forEach((spouse) => {
      if (
        !isFoyerConjointForFamilleDisplay(spouse, membre, groupNom, coreMemberIds) ||
        spousesAdded.has(spouse.id!)
      ) {
        return;
      }
      spousesAdded.add(spouse.id!);
      const spouseData = getContactPatrimoine(
        spouse,
        investissementsByContact,
        investissementsByFoyer
      );
      membresWithInvests.push({
        contact: spouse,
        investissements: spouseData.investissements,
        patrimoine: spouseData.total,
        patrimoinePerso: spouseData.patrimoinePerso,
        patrimoineCommun: spouseData.patrimoineCommun,
        avecMoiPerso: spouseData.avecMoiPerso,
        avecMoiCommun: spouseData.avecMoiCommun,
        avecMoiTotal: spouseData.avecMoiTotal,
        isSpouse: true,
        spouseOf: `Conjoint de ${membre.prenom}`,
      });
    });
  });

  if (includeSpouses) {
    const pendingFoyerChildren: MemberWithInvestments[] = [];
    membresSorted.forEach((membre) => {
      if (!membre.foyer_id) return;
      const foyerMembers = eligible.filter(
        (c) => c.foyer_id === membre.foyer_id && c.id !== membre.id
      );
      foyerMembers.forEach((child) => {
        if (
          !isFoyerEnfantForFamilleDisplay(child, coreMemberIds) ||
          child.id == null ||
          foyerChildrenAdded.has(child.id)
        ) {
          return;
        }
        foyerChildrenAdded.add(child.id);
        const childData = getContactPatrimoine(
          child,
          investissementsByContact,
          investissementsByFoyer
        );
        pendingFoyerChildren.push({
          contact: child,
          investissements: childData.investissements,
          patrimoine: childData.total,
          patrimoinePerso: childData.patrimoinePerso,
          patrimoineCommun: childData.patrimoineCommun,
          avecMoiPerso: childData.avecMoiPerso,
          avecMoiCommun: childData.avecMoiCommun,
          avecMoiTotal: childData.avecMoiTotal,
          isSpouse: false,
          isFoyerChild: true,
          foyerChildOf: `Foyer de ${membre.prenom}`,
        });
      });
    });
    pendingFoyerChildren.sort(
      (a, b) =>
        getRolePriority(a.contact.role_famille) -
        getRolePriority(b.contact.role_famille)
    );
    membresWithInvests.push(...pendingFoyerChildren);
  }

  return membresWithInvests;
}

function sumPatrimoine(membresWithInvests: MemberWithInvestments[]): {
  patrimoineTotal: number;
  patrimoineAvecMoi: number;
} {
  const foyersCommunsCounted = new Set<number>();
  const foyersAvecMoiCounted = new Set<number>();
  let patrimoineTotal = 0;
  let patrimoineAvecMoi = 0;

  membresWithInvests.forEach((m) => {
    patrimoineTotal += m.patrimoinePerso;
    patrimoineAvecMoi += m.avecMoiPerso;

    if (m.contact.foyer_id && !foyersCommunsCounted.has(m.contact.foyer_id)) {
      patrimoineTotal += m.patrimoineCommun;
      foyersCommunsCounted.add(m.contact.foyer_id);
    }

    if (m.contact.foyer_id && !foyersAvecMoiCounted.has(m.contact.foyer_id)) {
      patrimoineAvecMoi += m.avecMoiCommun;
      foyersAvecMoiCounted.add(m.contact.foyer_id);
    }
  });

  return { patrimoineTotal, patrimoineAvecMoi };
}

export function buildFamilleGroups(
  contacts: Contact[],
  foyers: Foyer[],
  familles: Famille[],
  investissementsByContact: Record<number, Investissement[]>,
  investissementsByFoyer: Record<number, Investissement[]>
): FamilleGroup[] {
  const eligible = contacts.filter((c) => !c.famille_regroupement_exclu);
  const groups: FamilleGroup[] = [];

  for (const famille of familles) {
    const membres = eligible.filter((c) => c.famille_id === famille.id);
    if (membres.length === 0) continue;

    const membresWithInvests = buildMembresWithInvests(
      membres,
      famille.nom.trim().toUpperCase(),
      eligible,
      investissementsByContact,
      investissementsByFoyer,
      true
    );
    const foyerIds = new Set(membres.map((m) => m.foyer_id).filter(Boolean));
    const { patrimoineTotal, patrimoineAvecMoi } = sumPatrimoine(membresWithInvests);

    groups.push({
      key: `manual:${famille.id}`,
      familleId: famille.id,
      nom: famille.nom.trim().toUpperCase(),
      isManual: true,
      membres: membresWithInvests,
      foyers: foyers.filter((f) => foyerIds.has(f.id)),
      patrimoineTotal,
      patrimoineAvecMoi,
    });
  }

  const groupMap = new Map<string, Contact[]>();
  eligible
    .filter((c) => c.famille_id == null)
    .forEach((contact) => {
      const nomNormalized = contact.nom.trim().toUpperCase();
      if (!groupMap.has(nomNormalized)) {
        groupMap.set(nomNormalized, []);
      }
      groupMap.get(nomNormalized)!.push(contact);
    });

  groupMap.forEach((membres, nom) => {
    if (membres.length < 2) return;

    const membresWithInvests = buildMembresWithInvests(
      membres,
      nom,
      eligible,
      investissementsByContact,
      investissementsByFoyer,
      true
    );
    const foyerIds = new Set(membres.map((m) => m.foyer_id).filter(Boolean));
    const { patrimoineTotal, patrimoineAvecMoi } = sumPatrimoine(membresWithInvests);

    groups.push({
      key: `auto:${nom}`,
      nom,
      isManual: false,
      membres: membresWithInvests,
      foyers: foyers.filter((f) => foyerIds.has(f.id)),
      patrimoineTotal,
      patrimoineAvecMoi,
    });
  });

  groups.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  return groups;
}
