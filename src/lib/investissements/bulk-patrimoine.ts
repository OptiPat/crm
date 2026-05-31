import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import type { Investissement } from "@/lib/api/tauri-investissements";
export type PatrimoineMaps = {
  patrimoines: Record<string, number>;
  patrimoinesAvecMoi: Record<string, number>;
};

/** Indexe les investissements par contact_id et foyer_id (centimes → euros dans les maps). */
export function indexInvestissementsByOwner(
  investissements: Investissement[]
): {
  byContactId: Record<number, Investissement[]>;
  byFoyerId: Record<number, Investissement[]>;
} {
  const byContactId: Record<number, Investissement[]> = {};
  const byFoyerId: Record<number, Investissement[]> = {};
  for (const inv of investissements) {
    if (inv.contact_id != null) {
      if (!byContactId[inv.contact_id]) byContactId[inv.contact_id] = [];
      byContactId[inv.contact_id].push(inv);
    }
    if (inv.foyer_id != null) {
      if (!byFoyerId[inv.foyer_id]) byFoyerId[inv.foyer_id] = [];
      byFoyerId[inv.foyer_id].push(inv);
    }
  }
  return { byContactId, byFoyerId };
}

function sumEuro(
  list: Pick<Investissement, "montant_initial" | "origine">[],
  avecMoiOnly?: boolean
): number {
  const filtered = avecMoiOnly
    ? list.filter((i) => i.origine === "MON_CONSEIL")
    : list;
  return (
    filtered.reduce((s, inv) => s + (inv.montant_initial || 0), 0) / 100
  );
}

/** Même logique qu’avant : patrimoine contact = lignes contact_id ; foyer = commun + membres. */
export function buildPatrimoineMaps(
  contacts: Contact[],
  foyers: Foyer[],
  investissements: Investissement[]
): PatrimoineMaps {
  const { byContactId } = indexInvestissementsByOwner(investissements);
  const foyerInvMap = buildFoyerInvestissementMaps(contacts, investissements);
  const patrimoines: Record<string, number> = {};
  const patrimoinesAvecMoi: Record<string, number> = {};

  for (const contact of contacts) {
    if (!contact.id) continue;
    const list = byContactId[contact.id] ?? [];
    patrimoines[`contact_${contact.id}`] = sumEuro(list);
    patrimoinesAvecMoi[`contact_${contact.id}`] = sumEuro(list, true);
  }

  for (const foyer of foyers) {
    const invs = foyerInvMap[foyer.id] ?? [];
    patrimoines[`foyer_${foyer.id}`] = sumEuro(invs);
    patrimoinesAvecMoi[`foyer_${foyer.id}`] = sumEuro(invs, true);
  }

  return { patrimoines, patrimoinesAvecMoi };
}

/** Patrimoine foyers en mémoire (évite N appels getInvestissementsByFoyer). */
export function buildFoyerInvestissementMaps(
  contacts: Contact[],
  investissements: Investissement[]
): Record<number, Investissement[]> {
  const { byContactId, byFoyerId } = indexInvestissementsByOwner(investissements);
  const result: Record<number, Investissement[]> = {};
  const foyerIds = new Set<number>();
  for (const inv of investissements) {
    if (inv.foyer_id != null) foyerIds.add(inv.foyer_id);
  }
  for (const fid of foyerIds) {
    const byId = new Map<number, Investissement>();
    for (const inv of byFoyerId[fid] ?? []) {
      byId.set(inv.id, inv);
    }
    for (const member of contacts) {
      if (!member.id || member.foyer_id !== fid) continue;
      for (const inv of byContactId[member.id] ?? []) {
        if (!byId.has(inv.id)) byId.set(inv.id, inv);
      }
    }
    result[fid] = Array.from(byId.values());
  }
  return result;
}
