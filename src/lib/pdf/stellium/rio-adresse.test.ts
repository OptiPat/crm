import { describe, expect, it } from "vitest";
import { parseAdressesPostales, parsePaysResidenceFiscale, parseStatutOccupationLogement } from "./rio-adresse";

describe("parseAdressesPostales", () => {
  it("layout inline (solo)", () => {
    const coordonnees =
      "Coordonnées\nAdresse e-mail\tj@example.com\nTéléphone mobile\t+33600000001\n" +
      "Adresse postale\t12 rue des Acacias\t75001 Paris - France\n";
    const [adr] = parseAdressesPostales(coordonnees);
    expect(adr).toEqual({
      adresse: "12 Rue des Acacias",
      codePostal: "75001",
      ville: "Paris",
    });
  });

  it("layout multi-lignes solo (rue avant le libellé, CP/ville après)", () => {
    const coordonnees =
      "Coordonnées\nAdresse e-mail\tj@example.com\nTéléphone mobile\t+33600000001\n" +
      "Autre téléphone\t-\n" +
      "7 rue des Lilas\n" +
      "Adresse postale\n" +
      "34000 Montpellier - France\n" +
      "Pays de résidence fiscale\tFrance\n";
    const [adr] = parseAdressesPostales(coordonnees);
    expect(adr).toEqual({
      adresse: "7 Rue des Lilas",
      codePostal: "34000",
      ville: "Montpellier",
    });
  });

  it("layout multi-lignes couple (colonnes séparées par tabulations)", () => {
    const coordonnees =
      "Coordonnées\nAdresse e-mail\ta@example.com\tb@example.com\n" +
      "Téléphone mobile\t+33600000001\t+33600000002\n" +
      "Autre téléphone\t-\t-\n" +
      "8 place du Marché\t8 place du Marché\n" +
      "Adresse postale\n" +
      "69001 Lyon - France\t69001 Lyon - France\n" +
      "Pays de résidence fiscale\tFrance\tFrance\n";
    const adresses = parseAdressesPostales(coordonnees);
    expect(adresses).toHaveLength(2);
    expect(adresses[0]).toEqual({
      adresse: "8 Place du Marché",
      codePostal: "69001",
      ville: "Lyon",
    });
    expect(adresses[1]).toEqual({
      adresse: "8 Place du Marché",
      codePostal: "69001",
      ville: "Lyon",
    });
  });

  it("layout inline couple (adresse répétée sur une ligne)", () => {
    const coordonnees =
      "Adresse postale\t3 allée des Ormes\t33000 Bordeaux - France\t3 allée des Ormes\t33000 Bordeaux - France\n";
    const adresses = parseAdressesPostales(coordonnees);
    expect(adresses).toHaveLength(2);
    expect(adresses[0].adresse).toBe("3 Allée des Ormes");
    expect(adresses[0].codePostal).toBe("33000");
    expect(adresses[1].ville).toBe("Bordeaux");
  });

  it("CP/ville seuls sans rue (rue absente du PDF)", () => {
    const coordonnees =
      "Téléphone mobile\t+33600000001\n" +
      "Adresse postale\n" +
      "75000 Paris - France\n";
    const [adr] = parseAdressesPostales(coordonnees);
    expect(adr.codePostal).toBe("75000");
    expect(adr.ville).toBe("Paris");
    expect(adr.adresse).toBeUndefined();
  });

  it("normalise la casse (ville en MAJ, rue en min, particules conservées)", () => {
    const coordonnees =
      "Autre téléphone\t-\n" +
      "11 BIS avenue DE LA RÉPUBLIQUE\n" +
      "Adresse postale\n" +
      "13100 AIX-EN-PROVENCE - France\n";
    const [adr] = parseAdressesPostales(coordonnees);
    expect(adr.adresse).toBe("11 bis Avenue de la République");
    expect(adr.ville).toBe("Aix-en-Provence");
  });

  it("ne confond pas une ligne de libellé avec une rue", () => {
    const coordonnees =
      "Téléphone mobile\t+33600000001\n" +
      "Adresse postale\n" +
      "75000 Paris - France\n";
    const [adr] = parseAdressesPostales(coordonnees);
    expect(adr.adresse).toBeUndefined();
  });
});

describe("parsePaysResidenceFiscale", () => {
  it("solo (valeur inline avec tabulation)", () => {
    const coordonnees =
      "75000 Paris - France\n" +
      "Pays de résidence fiscale\tFrance\n" +
      "Statut d'occupation du logement\tPropriétaire\n";
    expect(parsePaysResidenceFiscale(coordonnees)).toEqual(["France"]);
  });

  it("couple (deux colonnes)", () => {
    const coordonnees =
      "Pays de résidence fiscale\tFrance\tBelgique\n" +
      "Statut d'occupation du logement\tPropriétaire\tPropriétaire\n";
    expect(parsePaysResidenceFiscale(coordonnees)).toEqual([
      "France",
      "Belgique",
    ]);
  });

  it("layout aplati (séparateurs à espaces multiples, libellé suivant collé)", () => {
    const coordonnees =
      "Pays de résidence fiscale   France   France  Statut d'occupation du  logement   Propriétaire";
    expect(parsePaysResidenceFiscale(coordonnees)).toEqual(["France", "France"]);
  });

  it("absent → tableau vide", () => {
    expect(parsePaysResidenceFiscale("Téléphone mobile\t+33600000001\n")).toEqual(
      []
    );
  });
});

describe("parseStatutOccupationLogement", () => {
  it("solo (valeur inline avec tabulation)", () => {
    const coordonnees =
      "Pays de résidence fiscale\tFrance\n" +
      "Statut d'occupation du logement\tLocataire\n";
    expect(parseStatutOccupationLogement(coordonnees)).toEqual(["Locataire"]);
  });

  it("couple (deux colonnes)", () => {
    const coordonnees =
      "Statut d'occupation du logement\tPropriétaire\tPropriétaire\n";
    expect(parseStatutOccupationLogement(coordonnees)).toEqual([
      "Propriétaire",
      "Propriétaire",
    ]);
  });

  it("layout aplati (libellé coupé, séparateurs espaces)", () => {
    const coordonnees =
      "Statut d'occupation du  logement   Propriétaire   Locataire  Relations";
    expect(parseStatutOccupationLogement(coordonnees)).toEqual([
      "Propriétaire",
      "Locataire",
    ]);
  });

  it("hébergé à titre gratuit (libellé long)", () => {
    const coordonnees =
      "Statut d'occupation du logement\tHébergé(e) à titre gratuit\n";
    expect(parseStatutOccupationLogement(coordonnees)).toEqual([
      "Hébergé(e) à titre gratuit",
    ]);
  });

  it("couple multi-lignes (une valeur par ligne)", () => {
    const coordonnees =
      "Statut d'occupation du logement   Propriétaire\n" +
      "Locataire\n" +
      "Relations\n";
    expect(parseStatutOccupationLogement(coordonnees)).toEqual([
      "Propriétaire",
      "Locataire",
    ]);
  });

  it("absent → tableau vide", () => {
    expect(parseStatutOccupationLogement("Téléphone mobile\t+33600000001\n")).toEqual(
      []
    );
  });
});
