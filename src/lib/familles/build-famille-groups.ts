import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { getRolePriority } from "@/lib/familles/famille-roles";
import type {
  FamilleGroup,
  InvestWithCommun,
  MemberWithInvestments,
} from "@/lib/familles/famille-types";

function getContactPatrimoine(
  contact: Contact,
  investissementsByContact: Record<number, Investissement[]>,
  investissementsByFoyer: Record<number, Investissement[]>
): {
  investissements: InvestWithCommun[];
  patrimoinePerso: number;
  patrimoineCommun: number;
  total: number;
  avecMoiPerso: number;
  avecMoiCommun: number;
  avecMoiTotal: number;
} {
  const contactInvests: InvestWithCommun[] = (
    investissementsByContact[contact.id] || []
  ).map((inv) => ({ ...inv, isCommun: false }));

  let foyerInvests: InvestWithCommun[] = [];
  if (contact.foyer_id) {
    const allFoyerInvests = investissementsByFoyer[contact.foyer_id] || [];
    foyerInvests = allFoyerInvests
      .filter((inv) => !inv.contact_id)
      .map((inv) => ({ ...inv, isCommun: true }));
  }

  const allInvests = [...contactInvests, ...foyerInvests];
  const patrimoinePerso = contactInvests.reduce(
    (sum, inv) => sum + (inv.montant_initial || 0),
    0
  );
  const patrimoineCommun = foyerInvests.reduce(
    (sum, inv) => sum + (inv.montant_initial || 0),
    0
  );
  const total = patrimoinePerso + patrimoineCommun;

  const avecMoiPerso = contactInvests
    .filter((inv) => inv.origine === "MON_CONSEIL")
    .reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
  const avecMoiCommun = foyerInvests
    .filter((inv) => inv.origine === "MON_CONSEIL")
    .reduce((sum, inv) => sum + (inv.montant_initial || 0), 0);
  const avecMoiTotal = avecMoiPerso + avecMoiCommun;

  return {
    investissements: allInvests,
    patrimoinePerso,
    patrimoineCommun,
    total,
    avecMoiPerso,
    avecMoiCommun,
    avecMoiTotal,
  };
}

export function buildFamilleGroups(
  contacts: Contact[],
  foyers: Foyer[],
  investissementsByContact: Record<number, Investissement[]>,
  investissementsByFoyer: Record<number, Investissement[]>
): FamilleGroup[] {
  const groupMap = new Map<string, Contact[]>();

  const eligible = contacts.filter((c) => !c.famille_regroupement_exclu);

  eligible.forEach((contact) => {
    const nomNormalized = contact.nom.trim().toUpperCase();
    if (!groupMap.has(nomNormalized)) {
      groupMap.set(nomNormalized, []);
    }
    groupMap.get(nomNormalized)!.push(contact);
  });

  const groups: FamilleGroup[] = [];
  groupMap.forEach((membres, nom) => {
    if (membres.length < 2) return;

    const foyerIds = new Set(membres.map((m) => m.foyer_id).filter(Boolean));
    const famillesFoyers = foyers.filter((f) => foyerIds.has(f.id));

    const membresSorted = [...membres].sort(
      (a, b) => getRolePriority(a.role_famille) - getRolePriority(b.role_famille)
    );

    const membresWithInvests: MemberWithInvestments[] = [];
    const spousesAdded = new Set<number>();
    const foyersCommunsCounted = new Set<number>();

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

      if (membre.foyer_id) {
        const foyerMembers = eligible.filter(
          (c) => c.foyer_id === membre.foyer_id && c.id !== membre.id
        );
        foyerMembers.forEach((spouse) => {
          if (spouse.nom.toUpperCase() !== nom && !spousesAdded.has(spouse.id)) {
            spousesAdded.add(spouse.id);
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
          }
        });
      }
    });

    let patrimoineTotal = 0;
    let patrimoineAvecMoi = 0;
    const foyersAvecMoiCounted = new Set<number>();

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

    groups.push({
      nom,
      membres: membresWithInvests,
      foyers: famillesFoyers,
      patrimoineTotal,
      patrimoineAvecMoi,
    });
  });

  groups.sort((a, b) => a.nom.localeCompare(b.nom));
  return groups;
}
