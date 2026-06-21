import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import type { MemberWithInvestments } from "@/lib/familles/famille-types";
import { getContactPatrimoine } from "@/lib/investissements/contact-patrimoine";

const FOYER_ROLE_ORDER = ["DECLARANT_1", "DECLARANT_2", "ENFANT", "AUTRE"] as const;

function getFoyerRolePriority(role?: string | null): number {
  if (!role) return 99;
  const idx = FOYER_ROLE_ORDER.indexOf(role as (typeof FOYER_ROLE_ORDER)[number]);
  return idx >= 0 ? idx : 99;
}

/** Membres d'un foyer avec leurs investissements (perso + commun), triés par rôle. */
export function buildFoyerMembersWithInvestments(
  membres: Contact[],
  investissementsByContact: Record<number, Investissement[]>,
  investissementsByFoyer: Record<number, Investissement[]>
): MemberWithInvestments[] {
  const sorted = [...membres].sort(
    (a, b) => getFoyerRolePriority(a.role_foyer) - getFoyerRolePriority(b.role_foyer)
  );

  return sorted.map((contact) => {
    const data = getContactPatrimoine(
      contact,
      investissementsByContact,
      investissementsByFoyer
    );
    return {
      contact,
      investissements: data.investissements,
      patrimoine: data.total,
      patrimoinePerso: data.patrimoinePerso,
      patrimoineCommun: data.patrimoineCommun,
      avecMoiPerso: data.avecMoiPerso,
      avecMoiCommun: data.avecMoiCommun,
      avecMoiTotal: data.avecMoiTotal,
      isSpouse: false,
    };
  });
}
