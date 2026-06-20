import { describe, expect, it } from "vitest";
import {
  buildTacheTitlePlaceholder,
  findSimilarPendingTache,
  resolveTacheFormContextBanner,
} from "@/lib/taches/tache-form-presets";
import type { Tache } from "@/lib/api/tauri-taches";
import type { Contact } from "@/lib/api/tauri-contacts";

const contacts: Contact[] = [
  {
    id: 1,
    nom: "DUPONT",
    prenom: "Jean",
    categorie: "CLIENT",
  } as Contact,
];

describe("tache-form-presets", () => {
  it("placeholder dynamique avec prénom", () => {
    expect(buildTacheTitlePlaceholder({ firstPrenom: "Jean", firstNom: "DUPONT" })).toBe(
      "Rappeler Jean pour…"
    );
  });

  it("détecte un doublon probable", () => {
    const existing: Tache = {
      id: 9,
      titre: "Rappeler Jean pour IR",
      priorite: "NORMALE",
      statut: "A_FAIRE",
      contacts: [{ contact_id: 1, nom: "DUPONT", prenom: "Jean" }],
      created_at: 0,
      updated_at: 0,
    };
    const hit = findSimilarPendingTache(
      [existing],
      "Rappeler Jean pour IR",
      [1]
    );
    expect(hit?.id).toBe(9);
  });

  it("bandeau contexte alerte", () => {
    expect(
      resolveTacheFormContextBanner({
        creationContext: "alerte",
        contacts: [],
      })
    ).toContain("alerte Suivi");
  });

  it("bandeau contexte contact", () => {
    expect(
      resolveTacheFormContextBanner({
        fixedContactId: 1,
        contacts,
      })
    ).toBe("Contact : Jean DUPONT");
  });
});
