import { describe, expect, it } from "vitest";
import { buildFamilleGroups } from "./build-famille-groups";
import type { Contact } from "@/lib/api/tauri-contacts";

function contact(
  partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">
): Contact {
  return {
    categorie: "CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("buildFamilleGroups", () => {
  it("ignore les contacts exclus du regroupement par nom", () => {
    const contacts = [
      contact({ id: 1, nom: "Martin", prenom: "Paul" }),
      contact({ id: 2, nom: "Martin", prenom: "Jacques" }),
      contact({
        id: 3,
        nom: "Martin",
        prenom: "Pierre",
        famille_regroupement_exclu: true,
      }),
    ];
    const groups = buildFamilleGroups(contacts, [], {}, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].nom).toBe("MARTIN");
    expect(groups[0].membres.map((m) => m.contact.id)).toEqual([1, 2]);
  });
});
