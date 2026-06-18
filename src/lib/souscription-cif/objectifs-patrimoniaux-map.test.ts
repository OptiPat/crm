import { describe, expect, it } from "vitest";
import {
  formatObjectifsLettreMission,
  formatObjectifsRappelDemande,
  resolveObjectifsPatrimoniaux,
} from "@/lib/souscription-cif/objectifs-patrimoniaux-map";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Foyer } from "@/lib/api/tauri-foyers";

const contact = (objectifs?: string): Contact =>
  ({
    id: 1,
    categorie: "CLIENT",
    nom: "DUPONT",
    prenom: "Jean",
    statut_suivi: "ACTIF",
    objectifs_patrimoniaux: objectifs,
    created_at: 0,
    updated_at: 0,
  }) as Contact;

const foyer = (objectifs?: string): Foyer =>
  ({
    id: 10,
    nom: "DUPONT",
    type_foyer: "COUPLE",
    objectifs_patrimoniaux: objectifs,
    created_at: 0,
    updated_at: 0,
  }) as Foyer;

describe("objectifs-patrimoniaux-map", () => {
  it("priorise les objectifs du contact au foyer", () => {
    expect(
      resolveObjectifsPatrimoniaux(
        contact("Préparer la retraite"),
        foyer("Diversifier le patrimoine")
      )
    ).toBe("Préparer la retraite");
    expect(resolveObjectifsPatrimoniaux(null, foyer("Diversifier"))).toBe("Diversifier");
  });

  it("formate la lettre de mission avec le préfixe attendu", () => {
    expect(formatObjectifsLettreMission("Préparer votre retraite ; Diversifier")).toBe(
      "Vos objectifs d'investissement sont de préparer votre retraite ; Diversifier"
    );
  });

  it("formate le rappel de demande avec le préfixe attendu", () => {
    expect(formatObjectifsRappelDemande("Préparer votre retraite ; Diversifier")).toBe(
      "Le client souhaite préparer votre retraite ; Diversifier"
    );
  });
});
