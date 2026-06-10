import { describe, expect, it } from "vitest";
import { buildFamilleGroups } from "./build-famille-groups";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Famille } from "@/lib/api/tauri-familles";

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
    const groups = buildFamilleGroups(contacts, [], [], {}, {});
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe("auto:MARTIN");
    expect(groups[0].isManual).toBe(false);
    expect(groups[0].membres.map((m) => m.contact.id)).toEqual([1, 2]);
  });

  it("affiche une famille manuelle sans inclure les homonymes non rattachés", () => {
    const contacts = [
      contact({ id: 1, nom: "Dupont", prenom: "Frère", famille_id: 10 }),
      contact({ id: 2, nom: "Dupont", prenom: "Sœur", famille_id: 10 }),
      contact({ id: 3, nom: "Dupont", prenom: "Mère" }),
    ];
    const familles: Famille[] = [
      {
        id: 10,
        nom: "Dupont",
        notes: null,
        created_at: 0,
        updated_at: 0,
      },
    ];
    const groups = buildFamilleGroups(contacts, [], familles, {}, {});
    const manual = groups.find((g) => g.isManual);
    expect(manual?.membres.map((m) => m.contact.id).sort()).toEqual([1, 2]);
    expect(groups.some((g) => g.key === "auto:DUPONT")).toBe(false);
  });
});
