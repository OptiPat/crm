import { getPartenaireById } from "@/lib/api/tauri-partenaires";
import type { Investissement } from "@/lib/api/tauri-investissements";

/** Charge les raisons sociales partenaires pour une liste de contrats. */
export async function buildPartenaireNomMap(
  investissements: Pick<Investissement, "partenaire_id">[]
): Promise<Map<number, string>> {
  const map = new Map<number, string>();
  const ids = [
    ...new Set(
      investissements
        .map((inv) => inv.partenaire_id)
        .filter((id): id is number => id != null && id > 0)
    ),
  ];
  await Promise.all(
    ids.map(async (id) => {
      try {
        const partenaire = await getPartenaireById(id);
        const nom = partenaire.raison_sociale?.trim();
        if (nom) map.set(id, nom);
      } catch {
        // partenaire introuvable — on continue sans.
      }
    })
  );
  return map;
}
