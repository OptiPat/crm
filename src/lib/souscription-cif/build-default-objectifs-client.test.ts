import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";
import { describe, expect, it } from "vitest";
import {
  buildDefaultObjectifsClient,
  DEFAULT_OBJECTIFS_CLIENT_TEXT,
} from "@/lib/souscription-cif/build-default-objectifs-client";

function foyer(partial: Partial<Foyer> & Pick<Foyer, "id" | "nom">): Foyer {
  return {
    type_foyer: "COUPLE",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

const baseContact: Contact = {
  id: 1,
  categorie: "CLIENT",
  nom: "DUPONT",
  prenom: "Jean",
  statut_suivi: "ACTIF",
  created_at: 0,
  updated_at: 0,
};

describe("buildDefaultObjectifsClient", () => {
  it("retourne le texte type sans objectifs en base", () => {
    expect(buildDefaultObjectifsClient(null, null)).toBe(DEFAULT_OBJECTIFS_CLIENT_TEXT);
    expect(buildDefaultObjectifsClient(baseContact, foyer({ id: 1, nom: "Test" }))).toBe(
      DEFAULT_OBJECTIFS_CLIENT_TEXT
    );
  });

  it("reprend les objectifs du contact avec le préfixe lettre de mission", () => {
    expect(
      buildDefaultObjectifsClient(
        { ...baseContact, objectifs_patrimoniaux: "Préparer votre retraite" },
        null
      )
    ).toBe("Vos objectifs d'investissement sont de préparer votre retraite");
  });

  it("reprend les objectifs du foyer si le contact n'en a pas", () => {
    expect(
      buildDefaultObjectifsClient(
        baseContact,
        foyer({
          id: 1,
          nom: "Test",
          objectifs_patrimoniaux: "Diversifier et transmettre le patrimoine.",
        })
      )
    ).toBe(
      "Vos objectifs d'investissement sont de diversifier et transmettre le patrimoine."
    );
  });
});
