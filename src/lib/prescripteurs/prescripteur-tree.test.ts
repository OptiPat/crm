import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import {
  buildFoyersInfo,
  computePrescripteursRacines,
  countDirectClientsForPrescripteur,
  getContactDisplayName,
  pickPrescripteurRacineForFoyer,
} from "./prescripteur-tree";

function contact(partial: Partial<Contact> & Pick<Contact, "id" | "nom" | "prenom">): Contact {
  return {
    categorie: "CLIENT",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...partial,
  } as Contact;
}

const emptyInvests = {} as Record<number, never>;

describe("computePrescripteursRacines", () => {
  it("garde un prescripteur racine dans un foyer même si le conjoint a un prescripteur_id", () => {
    const sophie = contact({
      id: 1,
      prenom: "Sophie",
      nom: "Chaptal",
      foyer_id: 10,
      categorie: "PRESCRIPTEUR",
    });
    const eric = contact({
      id: 2,
      prenom: "Eric",
      nom: "Martin",
      foyer_id: 10,
      prescripteur_id: 99,
    });
    const client = contact({
      id: 3,
      prenom: "Alice",
      nom: "Durand",
      prescripteur_id: 1,
    });
    const autrePrescripteur = contact({
      id: 99,
      prenom: "Jean",
      nom: "Dupont",
      categorie: "PRESCRIPTEUR",
    });

    const racines = computePrescripteursRacines(
      [sophie, eric, client, autrePrescripteur],
      emptyInvests,
      emptyInvests
    );

    expect(racines.map((r) => r.contact.id)).toContain(1);
    expect(racines.map((r) => r.contact.id)).not.toContain(2);
  });

  it("garde un prescripteur référencé par des clients après création d'un foyer", () => {
    const sophie = contact({
      id: 1,
      prenom: "Sophie",
      nom: "Chaptal",
      foyer_id: 10,
    });
    const eric = contact({
      id: 2,
      prenom: "Eric",
      nom: "Martin",
      foyer_id: 10,
    });
    const client1 = contact({ id: 3, prenom: "A", nom: "Client", prescripteur_id: 1 });
    const client2 = contact({ id: 4, prenom: "B", nom: "Client", prescripteur_id: 1 });

    const racines = computePrescripteursRacines(
      [sophie, eric, client1, client2],
      emptyInvests,
      emptyInvests
    );

    expect(racines).toHaveLength(1);
    expect(racines[0].contact.id).toBe(1);
    expect(racines[0].nombreClientsDirects).toBe(2);
  });

  it("exclut un contact qui a lui-même un prescripteur_id", () => {
    const filleul = contact({
      id: 5,
      prenom: "Paul",
      nom: "Bernard",
      prescripteur_id: 1,
    });
    const prescripteur = contact({
      id: 1,
      prenom: "Sophie",
      nom: "Chaptal",
      categorie: "PRESCRIPTEUR",
    });

    const racines = computePrescripteursRacines(
      [filleul, prescripteur],
      emptyInvests,
      emptyInvests
    );

    expect(racines.map((r) => r.contact.id)).toEqual([1]);
  });

  it("compte les clients directs de tous les membres du foyer prescripteur", () => {
    const sophie = contact({
      id: 1,
      prenom: "Sophie",
      nom: "Chaptal",
      foyer_id: 10,
      categorie: "PRESCRIPTEUR",
    });
    const eric = contact({
      id: 2,
      prenom: "Eric",
      nom: "Martin",
      foyer_id: 10,
      categorie: "PRESCRIPTEUR",
    });
    const clientSophie = contact({ id: 3, prenom: "A", nom: "Client", prescripteur_id: 1 });
    const clientEric = contact({ id: 4, prenom: "B", nom: "Client", prescripteur_id: 2 });

    const racines = computePrescripteursRacines(
      [eric, sophie, clientSophie, clientEric],
      emptyInvests,
      emptyInvests
    );

    expect(racines).toHaveLength(1);
    expect(racines[0].nombreClientsDirects).toBe(2);
  });

  it("choisit le prescripteur avec le plus de clients quand les deux conjoints sont racines", () => {
    const sophie = contact({
      id: 1,
      prenom: "Sophie",
      nom: "Chaptal",
      foyer_id: 10,
      categorie: "PRESCRIPTEUR",
    });
    const eric = contact({
      id: 2,
      prenom: "Eric",
      nom: "Martin",
      foyer_id: 10,
      categorie: "PRESCRIPTEUR",
    });
    const clients = [
      contact({ id: 3, prenom: "C1", nom: "X", prescripteur_id: 1 }),
      contact({ id: 4, prenom: "C2", nom: "Y", prescripteur_id: 1 }),
      contact({ id: 5, prenom: "C3", nom: "Z", prescripteur_id: 2 }),
    ];

    const picked = pickPrescripteurRacineForFoyer([eric, sophie], [...clients, eric, sophie]);
    expect(picked.id).toBe(1);

    const racines = computePrescripteursRacines(
      [eric, sophie, ...clients],
      emptyInvests,
      emptyInvests
    );
    expect(racines).toHaveLength(1);
    expect(racines[0].contact.id).toBe(1);
  });
});

describe("buildFoyersInfo", () => {
  it("affiche un nom de foyer stable pour des noms de famille différents", () => {
    const sophie = contact({
      id: 1,
      prenom: "Sophie",
      nom: "Chaptal",
      foyer_id: 10,
    });
    const eric = contact({
      id: 2,
      prenom: "Eric",
      nom: "Martin",
      foyer_id: 10,
    });

    const foyersInfo = buildFoyersInfo([eric, sophie]);
    expect(foyersInfo[10].nom).toBe("Foyer CHAPTAL - MARTIN");
    expect(foyersInfo[10].displayName).toBe("Foyer CHAPTAL - MARTIN (Eric + Sophie)");
    expect(getContactDisplayName(sophie, foyersInfo)).toBe(
      "Foyer CHAPTAL - MARTIN (Eric + Sophie)"
    );
  });
});

describe("countDirectClientsForPrescripteur", () => {
  it("dédoublonne les clients d'un même foyer", () => {
    const prescripteur = contact({ id: 1, prenom: "Sophie", nom: "Chaptal" });
    const client1 = contact({ id: 2, prenom: "A", nom: "X", prescripteur_id: 1, foyer_id: 20 });
    const client2 = contact({ id: 3, prenom: "B", nom: "Y", prescripteur_id: 1, foyer_id: 20 });
    const foyersInfo = buildFoyersInfo([]);

    expect(
      countDirectClientsForPrescripteur(
        prescripteur,
        [prescripteur, client1, client2],
        foyersInfo
      )
    ).toBe(1);
  });
});
