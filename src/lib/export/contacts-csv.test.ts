import { describe, expect, it } from "vitest";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { InvestissementWithDetails } from "@/lib/api/tauri-investissements";
import {
  buildClientsContactsCsv,
  buildClientsExportHeaders,
  buildContactsExportFilename,
  buildFilleulsContactsCsv,
  buildFilleulsExportHeaders,
  clientExportIncludesPatrimoine,
  clientExportIncludesPremierR1,
  filleulExportIncludesParrainage,
  ANCIENS_CLIENTS_CONTACTS_CSV_HEADERS,
  CLIENTS_CONTACTS_CSV_HEADERS,
  CLIENTS_CONTACT_ONLY_CSV_HEADERS,
  EXPORT_DATE_DERNIER_CONTACT_HEADER,
  EXPORT_DATE_PREMIER_R1_HEADER,
  FILLEULS_CONTACTS_CSV_HEADERS,
  indexAvecMoiInvestissementsByContact,
  investissementAvecMoiDetailCells,
} from "./contacts-csv";

function contact(overrides: Partial<Contact> = {}): Contact {
  return {
    id: 1,
    categorie: "CLIENT",
    nom: "DUPONT",
    prenom: "Jean",
    email: "jean@example.com",
    telephone: "0612345678",
    adresse: "12 rue des Acacias",
    ville: "Lyon",
    code_postal: "69001",
    statut_suivi: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

function inv(overrides: Partial<InvestissementWithDetails> = {}): InvestissementWithDetails {
  return {
    id: 10,
    contact_id: 1,
    contact_nom: "DUPONT",
    contact_prenom: "Jean",
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Contrat AV",
    partenaire_nom: "Stellium",
    montant_initial: 100000,
    date_souscription: Date.parse("2024-03-15"),
    versement_programme: true,
    montant_versement_programme: 5000,
    frequence_versement: "MENSUEL",
    reinvestissement_dividendes: true,
    origine: "MON_CONSEIL",
    statut: "ACTIF",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("contacts-csv clients export", () => {
  it("nomme le fichier selon l'onglet clients", () => {
    expect(buildContactsExportFilename("clients", "CLIENT", "2026-07-20")).toBe(
      "clients_2026-07-20.csv"
    );
    expect(buildContactsExportFilename("clients", "PROSPECT_CLIENT", "2026-07-20")).toBe(
      "prospects_2026-07-20.csv"
    );
    expect(buildContactsExportFilename("clients", "CLIENT_ANCIEN", "2026-07-20")).toBe(
      "anciens_clients_2026-07-20.csv"
    );
    expect(buildContactsExportFilename("filleuls", "FILLEUL", "2026-07-20")).toBe(
      "filleuls_2026-07-20.csv"
    );
  });

  it("expose les en-têtes clients avec suivi et patrimoine", () => {
    expect(CLIENTS_CONTACTS_CSV_HEADERS).toEqual([
      ...CLIENTS_CONTACT_ONLY_CSV_HEADERS,
      EXPORT_DATE_PREMIER_R1_HEADER,
      "Date de souscription",
      "Type de produit",
      "Partenaire",
      "Nom du Produit",
      "Montant initial",
      "Montant des VP",
      "Fréquence",
      "Réinvestissement dividendes",
      EXPORT_DATE_DERNIER_CONTACT_HEADER,
    ]);
    expect(CLIENTS_CONTACTS_CSV_HEADERS[CLIENTS_CONTACTS_CSV_HEADERS.length - 1]).toBe(
      EXPORT_DATE_DERNIER_CONTACT_HEADER
    );
  });

  it("clients et prospects : date dernier contact et premier R1", () => {
    const csv = buildClientsContactsCsv(
      [
        contact({
          date_dernier_contact: 1_704_067_200,
          date_r1: 1_735_689_600,
        }),
      ],
      [],
      "CLIENT",
      []
    );
    expect(csv).toContain("Date du dernier contact");
    expect(csv).toContain("Date du premier R1");
    expect(csv).toContain("01/01/2024");

    const prospectCsv = buildClientsContactsCsv(
      [contact({ categorie: "PROSPECT_CLIENT", date_dernier_contact: 1_704_067_200, date_r1: 1_735_689_600 })],
      [],
      "PROSPECT_CLIENT",
      []
    );
    expect(buildClientsExportHeaders("PROSPECT_CLIENT")).toContain(EXPORT_DATE_PREMIER_R1_HEADER);
    expect(buildClientsExportHeaders("PROSPECT_CLIENT")[
      buildClientsExportHeaders("PROSPECT_CLIENT").length - 1
    ]).toBe(EXPORT_DATE_DERNIER_CONTACT_HEADER);
    expect(prospectCsv).toContain("01/01/2024");
    expect(prospectCsv).not.toContain("Date de souscription");
  });

  it("suspects et anciens clients : dernier contact sans premier R1", () => {
    expect(clientExportIncludesPremierR1("SUSPECT_CLIENT")).toBe(false);
    expect(clientExportIncludesPremierR1("CLIENT_ANCIEN")).toBe(false);
    expect(buildClientsExportHeaders("SUSPECT_CLIENT")).not.toContain(EXPORT_DATE_PREMIER_R1_HEADER);
    expect(buildClientsExportHeaders("CLIENT_ANCIEN")).not.toContain(EXPORT_DATE_PREMIER_R1_HEADER);
    expect(buildClientsExportHeaders("SUSPECT_CLIENT")[
      buildClientsExportHeaders("SUSPECT_CLIENT").length - 1
    ]).toBe(EXPORT_DATE_DERNIER_CONTACT_HEADER);

    const csv = buildClientsContactsCsv(
      [contact({ categorie: "SUSPECT_CLIENT", date_dernier_contact: 1_704_067_200, date_r1: 1_735_689_600 })],
      [],
      "SUSPECT_CLIENT",
      []
    );
    expect(csv).toContain("01/01/2024");
    expect(csv).not.toContain("Date du premier R1");
  });

  it("détaille le patrimoine avec moi sur plusieurs lignes", () => {
    const csv = buildClientsContactsCsv(
      [contact({ id: 1, foyer_id: 5 })],
      [{ id: 5, nom: "Foyer DUPONT", type_foyer: "COUPLE", created_at: 0, updated_at: 0 }],
      "CLIENT",
      [
        inv({ id: 10, nom_produit: "AV 1" }),
        inv({ id: 11, nom_produit: "PER 1", type_produit: "PER" }),
        inv({ id: 12, contact_id: 99, origine: "MON_CONSEIL", nom_produit: "Autre" }),
        inv({ id: 13, origine: "EXISTANT_CLIENT", nom_produit: "À côté" }),
      ]
    );
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toContain("Jean;DUPONT;jean@example.com");
    expect(lines[1]).toContain("AV 1");
    expect(lines[2]).toContain("PER 1");
    expect(lines[1]).not.toContain("À côté");
  });

  it("garde une ligne contact sans investissement avec moi", () => {
    const csv = buildClientsContactsCsv([contact()], [], "CLIENT", []);
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]?.split(";")).toHaveLength(CLIENTS_CONTACTS_CSV_HEADERS.length);
    expect(lines[1]).toContain("Jean;DUPONT");
  });

  it("formate VP et réinvestissement", () => {
    const cells = investissementAvecMoiDetailCells(inv(), "CLIENT");
    expect(cells).toHaveLength(8);
    expect(cells[4]).toBe("1000.00");
    expect(cells[5]).toBe("50.00");
    expect(cells[6]).toBe("MENSUEL");
    expect(cells[7]).toBe("Oui");
  });

  it("anciens clients : colonne date de clôture par investissement", () => {
    const headers = ANCIENS_CLIENTS_CONTACTS_CSV_HEADERS;
    expect(headers).toContain("Date de clôture");
    expect(headers.indexOf("Date de clôture")).toBe(headers.indexOf("Date de souscription") + 1);

    const cells = investissementAvecMoiDetailCells(
      inv({ date_cloture: 1_704_067_200 }),
      "CLIENT_ANCIEN"
    );
    expect(cells).toHaveLength(9);
    expect(cells[1]).toBe("01/01/2024");

    const csv = buildClientsContactsCsv(
      [contact({ statut_suivi: "EN_PAUSE" })],
      [],
      "CLIENT_ANCIEN",
      [inv({ date_cloture: 1_704_067_200, nom_produit: "AV clos" })]
    );
    expect(csv).toContain("Date de clôture");
    expect(csv).toContain("01/01/2024");
    expect(csv).toContain("AV clos");
  });

  it("indexe uniquement les investissements avec moi du contact", () => {
    const map = indexAvecMoiInvestissementsByContact(
      [
        inv({ id: 1, contact_id: 1 }),
        inv({ id: 2, contact_id: 1, origine: "EXISTANT_CLIENT" }),
        inv({ id: 3, contact_id: 2 }),
      ],
      [contact({ id: 1 }), contact({ id: 2 })]
    );
    expect(map.get(1)).toHaveLength(1);
    expect(map.get(2)).toHaveLength(1);
  });

  it("inclut les investissements communs du foyer (à 2)", () => {
    const map = indexAvecMoiInvestissementsByContact(
      [
        inv({ id: 1, contact_id: 1, nom_produit: "AV perso" }),
        inv({
          id: 2,
          contact_id: undefined,
          foyer_id: 5,
          nom_produit: "SCPI couple",
          type_produit: "SCPI",
        }),
      ],
      [contact({ id: 1, foyer_id: 5 })]
    );
    const invs = map.get(1) ?? [];
    expect(invs).toHaveLength(2);
    expect(invs.map((i) => i.nom_produit)).toEqual(["AV perso", "SCPI couple"]);
  });

  it("exporte les investissements communs du foyer sur la ligne contact", () => {
    const csv = buildClientsContactsCsv(
      [contact({ id: 1, foyer_id: 5 })],
      [{ id: 5, nom: "Foyer DUPONT", type_foyer: "COUPLE", created_at: 0, updated_at: 0 }],
      "CLIENT",
      [
        inv({
          id: 2,
          contact_id: undefined,
          foyer_id: 5,
          nom_produit: "SCPI couple",
          type_produit: "SCPI",
        }),
      ]
    );
    expect(csv).toContain("SCPI couple");
  });

  it("prospects et suspects : contact seul, sans souscription", () => {
    expect(clientExportIncludesPatrimoine("PROSPECT_CLIENT")).toBe(false);
    expect(clientExportIncludesPatrimoine("SUSPECT_CLIENT")).toBe(false);
    expect(clientExportIncludesPatrimoine("CLIENT")).toBe(true);

    const csv = buildClientsContactsCsv(
      [contact({ categorie: "PROSPECT_CLIENT", statut_suivi: "ACTIF" })],
      [],
      "PROSPECT_CLIENT",
      [inv({ nom_produit: "Ne doit pas apparaitre" })]
    );
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe(buildClientsExportHeaders("PROSPECT_CLIENT").join(";"));
    expect(lines).toHaveLength(2);
    expect(lines[1]).toContain("Jean;DUPONT");
    expect(csv).not.toContain("Ne doit pas apparaitre");
    expect(csv).not.toContain("Date de souscription");
  });

  it("exporte les filleuls avec parrainage réseau et dernier contact filleul", () => {
    expect(FILLEULS_CONTACTS_CSV_HEADERS).toEqual(buildFilleulsExportHeaders("FILLEUL"));
    expect(FILLEULS_CONTACTS_CSV_HEADERS[FILLEULS_CONTACTS_CSV_HEADERS.length - 1]).toBe(
      EXPORT_DATE_DERNIER_CONTACT_HEADER
    );

    const csv = buildFilleulsContactsCsv(
      [
        contact({
          id: 2,
          categorie: "CLIENT",
          filleul_categorie: "FILLEUL",
          parrain_id: 1,
          date_dernier_contact_filleul: 1_735_689_600,
          date_inscription_filleul: 1_704_067_200,
          filleul_titre: "MANAGER",
          filleul_qualification: "ETOILE",
        }),
      ],
      [],
      "FILLEUL",
      [contact({ id: 1, nom: "MARTIN", prenom: "Paul" })]
    );
    const line = csv.replace(/^\uFEFF/, "").split("\r\n")[1] ?? "";
    expect(line).toContain("Paul MARTIN");
    expect(line).toContain("01/01/2024");
    expect(line).toContain("01/01/2025");
    expect(line).toContain("Manager");
    expect(line).toContain("Étoile");
    expect(csv).not.toContain("Patrimoine");
    expect(csv).not.toContain("Étiquettes");
  });

  it("prospects et suspects filleuls : contact seul, sans parrainage", () => {
    expect(filleulExportIncludesParrainage("PROSPECT_FILLEUL")).toBe(false);
    expect(filleulExportIncludesParrainage("SUSPECT_FILLEUL")).toBe(false);
    expect(filleulExportIncludesParrainage("FILLEUL")).toBe(true);

    const csv = buildFilleulsContactsCsv(
      [
        contact({
          filleul_categorie: "PROSPECT_FILLEUL",
          parrain_id: 1,
          date_inscription_filleul: 1_704_067_200,
          filleul_titre: "MANAGER",
          filleul_qualification: "ETOILE",
        }),
      ],
      [],
      "PROSPECT_FILLEUL",
      [contact({ id: 1, nom: "MARTIN", prenom: "Paul" })]
    );
    const lines = csv.replace(/^\uFEFF/, "").split("\r\n");
    expect(lines[0]).toBe(buildFilleulsExportHeaders("PROSPECT_FILLEUL").join(";"));
    expect(lines).toHaveLength(2);
    expect(csv).toContain(EXPORT_DATE_DERNIER_CONTACT_HEADER);
    expect(csv).not.toContain("Nom du parrain");
    expect(csv).not.toContain("Paul MARTIN");
    expect(csv).not.toContain("Étoile");
  });
});
