import type { Contact } from "@/lib/api/tauri-contacts";
import { describe, expect, it } from "vitest";
import {
  buildDefaultRappelDemande,
  DEFAULT_RAPPEL_DEMANDE_TEXT,
} from "@/lib/souscription-cif/build-default-rappel-demande";

const baseContact: Contact = {
  id: 1,
  categorie: "CLIENT",
  nom: "DUPONT",
  prenom: "Jean",
  statut_suivi: "ACTIF",
  created_at: 0,
  updated_at: 0,
};

describe("buildDefaultRappelDemande", () => {
  it("retourne le texte type sans objectifs", () => {
    expect(buildDefaultRappelDemande(null, null)).toBe(DEFAULT_RAPPEL_DEMANDE_TEXT);
  });

  it("reprend les objectifs du contact avec le préfixe rappel de demande", () => {
    expect(
      buildDefaultRappelDemande(
        {
          ...baseContact,
          objectifs_patrimoniaux: "Compléter ses revenus ; Préparer sa retraite",
        },
        null
      )
    ).toBe(
      "Le client souhaite compléter ses revenus et préparer sa retraite"
    );
  });
});
