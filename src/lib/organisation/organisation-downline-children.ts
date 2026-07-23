import type { Contact } from "@/lib/api/tauri-contacts";
import {
  indexContactsById,
  indexDownlineByParrain,
} from "@/lib/organisation/organisation-tree";
import {
  isDownlineVisibleInExercice,
  resolveVisibleDownlineParrainId,
  type OrganisationExerciceVisibilityOptions,
} from "@/lib/organisation/organisation-exercice-visibility";

function compareContactsByPrenom(a: Contact, b: Contact): number {
  const prenomA = a.prenom.toLocaleLowerCase("fr");
  const prenomB = b.prenom.toLocaleLowerCase("fr");
  if (prenomA !== prenomB) return prenomA.localeCompare(prenomB, "fr");
  return a.nom.toLocaleLowerCase("fr").localeCompare(b.nom.toLocaleLowerCase("fr"), "fr");
}

/** Index parrain → enfants visibles (avec promotion si parrain absent de l'exercice). */
export function buildVisibleDownlineByParrain(
  contacts: Contact[],
  selfContactId: number,
  options?: OrganisationExerciceVisibilityOptions
): Map<number, Contact[]> {
  const byId = indexContactsById(contacts);
  const byParrain = indexDownlineByParrain(contacts);
  const map = new Map<number, Contact[]>();

  for (const children of byParrain.values()) {
    for (const child of children) {
      if (!isDownlineVisibleInExercice(child, options)) continue;
      const visibleParrainId = resolveVisibleDownlineParrainId(
        child,
        selfContactId,
        byId,
        options
      );
      const list = map.get(visibleParrainId) ?? [];
      list.push(child);
      map.set(visibleParrainId, list);
    }
  }

  for (const list of map.values()) {
    list.sort(compareContactsByPrenom);
  }

  return map;
}

/** Compte les descendants visibles sous un parrain (actifs + désinscrits de l'exercice). */
export function countVisibleDownlineDescendants(
  parrainId: number,
  contacts: Contact[],
  selfContactId: number,
  options?: OrganisationExerciceVisibilityOptions
): number {
  const byParrain = buildVisibleDownlineByParrain(contacts, selfContactId, options);
  let total = 0;
  const stack = [...(byParrain.get(parrainId) ?? [])];

  while (stack.length > 0) {
    const current = stack.pop()!;
    total += 1;
    for (const child of byParrain.get(current.id) ?? []) {
      stack.push(child);
    }
  }

  return total;
}
