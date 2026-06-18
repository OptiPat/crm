import { describe, expect, it } from "vitest";
import {
  elideDeInfinitive,
  formatObjectifsLettreMission,
  formatObjectifsRappelDemande,
  joinObjectifsPhrase,
  objectifsToSecondPerson,
  objectifsToThirdPerson,
  parseRioObjectifsList,
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

const RIO_OBJECTIFS =
  "Optimiser la rentabilité de vos placements financiers ; Préparer votre retraite ; Se constituer un patrimoine immobilier";

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

  it("parse la liste RIO point-virgule", () => {
    expect(parseRioObjectifsList(RIO_OBJECTIFS)).toEqual([
      "optimiser la rentabilité de vos placements financiers",
      "préparer votre retraite",
      "se constituer un patrimoine immobilier",
    ]);
  });

  it("joint les objectifs en phrase naturelle", () => {
    expect(joinObjectifsPhrase(["a", "b", "c"])).toBe("a, b et c");
  });

  it("élide de + voyelle", () => {
    expect(elideDeInfinitive("optimiser la rentabilité")).toBe(
      "d'optimiser la rentabilité"
    );
    expect(elideDeInfinitive("préparer la retraite")).toBe("de préparer la retraite");
  });

  it("convertit la 2e personne RIO en 3e personne pour le rapport", () => {
    expect(objectifsToThirdPerson("optimiser la rentabilité de vos placements")).toBe(
      "optimiser la rentabilité de ses placements"
    );
    expect(objectifsToThirdPerson("préparer votre retraite")).toBe("préparer sa retraite");
  });

  it("convertit Se constituer en vous constituer pour la lettre", () => {
    expect(objectifsToSecondPerson("se constituer un patrimoine immobilier")).toBe(
      "vous constituer un patrimoine immobilier"
    );
  });

  it("formate la lettre de mission depuis objectifs RIO", () => {
    expect(formatObjectifsLettreMission(RIO_OBJECTIFS)).toBe(
      "Vos objectifs d'investissement sont d'optimiser la rentabilité de vos placements financiers, préparer votre retraite et vous constituer un patrimoine immobilier"
    );
  });

  it("formate le rappel de demande depuis objectifs RIO", () => {
    expect(formatObjectifsRappelDemande(RIO_OBJECTIFS)).toBe(
      "Le client souhaite optimiser la rentabilité de ses placements financiers, préparer sa retraite et se constituer un patrimoine immobilier"
    );
  });

  it("conserve un texte déjà préfixé", () => {
    const prefixed =
      "Le client souhaite diversifier son patrimoine et préparer sa retraite.";
    expect(formatObjectifsRappelDemande(prefixed)).toBe(prefixed);
  });
});
