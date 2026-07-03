import { describe, it, expect } from "vitest";
import { IMMO_COMMANDES_SAMPLE_ROWS } from "./__fixtures__/immo-commandes-fixture";
import {
  buildImmoCommandesImportPreview,
  buildImmoNomProduit,
  cleanProgrammeName,
  mapDispositifFiscalToTypeProduit,
  parseImmoCommandeRows,
  parseImmoPrixTtcCentimes,
  parseNomCompletInvestisseur,
  patchImmoPreviewLine,
  patchImmoPreviewLines,
  pickImmoCommandesSheetName,
  resolveContactForImmoImport,
} from "./immo-commandes-import";
import type { Contact } from "@/lib/api/tauri-contacts";

describe("immo-commandes-import", () => {
  it("parseNomCompletInvestisseur — NOM Prénom et nom composé", () => {
    expect(parseNomCompletInvestisseur("DUPONT Marie")).toEqual({
      nom: "DUPONT",
      prenom: "Marie",
    });
    expect(parseNomCompletInvestisseur("DE LA ROCHE Jean")).toEqual({
      nom: "DE LA ROCHE",
      prenom: "Jean",
    });
    expect(parseNomCompletInvestisseur("NOM1")).toBeNull();
  });

  it("cleanProgrammeName retire PICD / PICKD / Picking", () => {
    expect(cleanProgrammeName("PICKD Ducs DIJON")).toBe("Ducs DIJON");
    expect(cleanProgrammeName("Picking MARIGNAN 030")).toBe("MARIGNAN 030");
    expect(cleanProgrammeName("PICD Picking Test")).toBe("Test");
  });

  it("buildImmoNomProduit ajoute la ville", () => {
    expect(buildImmoNomProduit("Villa Jeanne", "ST AUNES")).toBe(
      "Villa Jeanne — ST AUNES"
    );
    expect(buildImmoNomProduit("PICKD Hotel X", "NIMES")).toBe("Hotel X — NIMES");
  });

  it("mapDispositifFiscalToTypeProduit — dispositif → type CRM, pas locatif classique", () => {
    expect(mapDispositifFiscalToTypeProduit("Pinel")).toBe("PINEL");
    expect(mapDispositifFiscalToTypeProduit("Malraux")).toBe("MALRAUX");
    expect(mapDispositifFiscalToTypeProduit("Besson")).toBe("AUTRE");
  });

  it("parseImmoCommandeRows — Besson en AUTRE + note dispositif", () => {
    const rows = parseImmoCommandeRows([
      {
        "Nom complet Investisseur": "NOM1 Test",
        "Nom Programme": "Programme X",
        "Ville Programme": "VILLE",
        "Dispositif Fiscal": "Besson",
        "Date Acte": "2020-01-01",
        "Prix TTC": 100000,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.typeProduit).toBe("AUTRE");
    expect(rows[0]!.nomProduit).toBe("Programme X — VILLE");
    expect(rows[0]!.notes).toContain("Dispositif fiscal: Besson");
  });

  it("parseImmoCommandeRows — ignore ligne sans Date Acte", () => {
    const rows = parseImmoCommandeRows(IMMO_COMMANDES_SAMPLE_ROWS);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.nomProduit).toBe("Villa Jeanne — ST AUNES");
    expect(rows[0]!.coInvestorNom).toBe("LEGRAND");
    expect(rows[0]!.partenaireNom).toBe("PROMOTEUR EXEMPLE");
    expect(rows[1]!.nomProduit).toBe("Ducs DIJON — WOLFISHEIM");
  });

  it("patchImmoPreviewLine — correction type Pinel → Malraux", () => {
    const rows = parseImmoCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Marie",
        "Nom Programme": "Programme X",
        "Ville Programme": "VILLE",
        "Dispositif Fiscal": "Pinel",
        "Date Acte": "2020-01-01",
        "Prix TTC": 100000,
      },
    ]);
    const contacts: Contact[] = [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Marie",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ];
    const preview = buildImmoCommandesImportPreview(rows, contacts, []);
    const patched = patchImmoPreviewLine(
      preview[0]!,
      { typeProduit: "MALRAUX" },
      contacts,
      []
    );
    expect(patched.typeProduit).toBe("MALRAUX");
    expect(patched.status).toBe("ready");
  });

  it("patchImmoPreviewLine — ajout partenaire et montant", () => {
    const rows = parseImmoCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Marie",
        "Nom Programme": "Programme X",
        "Ville Programme": "VILLE",
        "Dispositif Fiscal": "Pinel",
        "Date Acte": "2020-01-01",
        "Prix TTC": 100000,
      },
    ]);
    const contacts: Contact[] = [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Marie",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ];
    const preview = buildImmoCommandesImportPreview(rows, contacts, []);
    const patched = patchImmoPreviewLine(
      preview[0]!,
      { partenaireNom: "NEXITY", montantCentimes: 12000000 },
      contacts,
      []
    );
    expect(patched.partenaireNom).toBe("NEXITY");
    expect(patched.montantCentimes).toBe(12000000);
  });

  it("patchImmoPreviewLines — débloque doublon fichier si 1ère occurrence modifiée", () => {
    const rows = parseImmoCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Marie",
        "Nom Programme": "Programme X",
        "Ville Programme": "VILLE",
        "Dispositif Fiscal": "Pinel",
        "Date Acte": "2020-01-01",
        "Prix TTC": 100000,
      },
      {
        "Nom complet Investisseur": "DUPONT Marie",
        "Nom Programme": "Programme X",
        "Ville Programme": "VILLE",
        "Dispositif Fiscal": "Pinel",
        "Date Acte": "2020-01-01",
        "Prix TTC": 100000,
      },
    ]);
    const contacts: Contact[] = [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Marie",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ];
    const preview = buildImmoCommandesImportPreview(rows, contacts, []);
    expect(preview[0]!.status).toBe("ready");
    expect(preview[1]!.status).toBe("duplicate_csv");

    const updated = patchImmoPreviewLines(
      preview,
      preview[0]!.lineKey,
      { montantCentimes: 12000000 },
      contacts,
      []
    );
    expect(updated[0]!.status).toBe("ready");
    expect(updated[1]!.status).toBe("ready");
  });

  it("resolveContactForImmoImport par nom puis email", () => {
    const contacts: Contact[] = [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Marie",
        email: "marie.dupont@example.com",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ];
    expect(
      resolveContactForImmoImport(contacts, "DUPONT", "Marie", undefined)?.id
    ).toBe(1);
    expect(
      resolveContactForImmoImport(contacts, "INCONNU", "X", "marie.dupont@example.com")
        ?.id
    ).toBe(1);
  });

  it("buildImmoCommandesImportPreview — co-investisseur manquant", () => {
    const rows = parseImmoCommandeRows(IMMO_COMMANDES_SAMPLE_ROWS);
    const contacts: Contact[] = [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Marie",
        email: "marie.dupont@example.com",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
      {
        id: 2,
        nom: "BERNARD",
        prenom: "Luc",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ];
    const preview = buildImmoCommandesImportPreview(rows, contacts, []);
    expect(preview[0]!.status).toBe("co_contact_not_found");
    expect(preview[1]!.status).toBe("ready");
  });

  it("parseImmoPrixTtcCentimes rejette montants invalides", () => {
    expect(parseImmoPrixTtcCentimes(266152)).toBe(26615200);
    expect(parseImmoPrixTtcCentimes(0)).toBeNull();
    expect(parseImmoPrixTtcCentimes(-100)).toBeNull();
    expect(parseImmoPrixTtcCentimes("187 200")).toBe(18720000);
  });

  it("pickImmoCommandesSheetName", () => {
    expect(
      pickImmoCommandesSheetName(["Autre", "Investissement Immobilier"])
    ).toBe("Investissement Immobilier");
    expect(pickImmoCommandesSheetName(["Feuille1"])).toBe("Feuille1");
  });
});
