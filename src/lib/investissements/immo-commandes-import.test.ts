import { describe, it, expect } from "vitest";
import { IMMO_COMMANDES_SAMPLE_ROWS } from "./__fixtures__/immo-commandes-fixture";
import {
  buildImmoCommandesImportPreview,
  buildImmoNomProduit,
  cleanProgrammeName,
  extractImmoLotDisplayFromNotes,
  getImmoCrmDiffFieldHighlights,
  immoNomProduitMatches,
  mapDispositifFiscalToTypeProduit,
  normalizeImmoImportLotLabel,
  parseImmoCommandeRows,
  parseImmoPrixTtcCentimes,
  parseNomCompletInvestisseur,
  patchImmoPreviewLine,
  patchImmoPreviewLines,
  pickImmoCommandesSheetName,
  resolveContactForImmoImport,
  isImmoImportLineSelectable,
  defaultSelectedImmoLineKeys,
  type ImmoImportPreviewLine,
} from "./immo-commandes-import";
import type { Contact } from "@/lib/api/tauri-contacts";
import type { Investissement } from "@/lib/api/tauri-investissements";
import { dateInputToUnix } from "@/lib/dates/calendar-date";
import { isoToDateInput } from "@/lib/contacts/parse-import-date";

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
    expect(mapDispositifFiscalToTypeProduit("Besson")).toBe("BESSON");
    expect(mapDispositifFiscalToTypeProduit("Scellier")).toBe("SCELLIER");
    expect(mapDispositifFiscalToTypeProduit("Duflot")).toBe("DUFLOT");
  });

  it("parseImmoCommandeRows — Besson mappé en BESSON", () => {
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
    expect(rows[0]!.typeProduit).toBe("BESSON");
    expect(rows[0]!.nomProduit).toBe("Programme X — VILLE");
    expect(rows[0]!.notes).toBeUndefined();
  });

  it("parseImmoCommandeRows — ignore ligne sans Date Acte", () => {
    const rows = parseImmoCommandeRows(IMMO_COMMANDES_SAMPLE_ROWS);
    expect(rows).toHaveLength(2);
    expect(rows[0]!.nomProduit).toBe("Villa Jeanne — ST AUNES");
    expect(rows[0]!.notes).toBe("Lot A113");
    expect(rows[0]!.coInvestorNom).toBe("LEGRAND");
    expect(rows[0]!.partenaireNom).toBe("PROMOTEUR EXEMPLE");
    expect(rows[1]!.nomProduit).toBe("Ducs DIJON — WOLFISHEIM");
  });

  it("normalizeImmoImportLotLabel et extractImmoLotDisplayFromNotes", () => {
    expect(normalizeImmoImportLotLabel("Lot 104 Bacchus-Dion")).toBe("Lot 104 Bacchus-Dion");
    expect(
      extractImmoLotDisplayFromNotes(
        "Lot: Lot 104 Bacchus-Dion | État: Validée comptablement | Comptant: OUI"
      )
    ).toBe("Lot 104 Bacchus-Dion");
  });

  it("buildImmoCommandesImportPreview détecte duplicate_crm même si montant CRM diffère", () => {
    const rows = parseImmoCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Marie",
        "Nom Programme": "Programme X",
        "Ville Programme": "VILLE",
        "Dispositif Fiscal": "Pinel",
        "Date Acte": "2020-01-01",
        "Prix TTC": 100000,
        Lot: "Lot 104 Bacchus-Dion",
      },
    ]);
    const preview = buildImmoCommandesImportPreview(rows, [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Marie",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ], [
      {
        id: 10,
        contact_id: 1,
        type_produit: "PINEL",
        nom_produit: "Programme X — VILLE",
        montant_initial: 50_000_00,
        versement_programme: false,
        reinvestissement_dividendes: false,
        origine: "MON_CONSEIL",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    expect(preview[0]!.status).toBe("duplicate_crm");
    expect(preview[0]!.notes).toBe("Lot 104 Bacchus-Dion");
    const highlights = getImmoCrmDiffFieldHighlights(
      preview[0]!,
      {
        id: 10,
        contact_id: 1,
        type_produit: "PINEL",
        nom_produit: "Programme X — VILLE",
        montant_initial: 50_000_00,
        versement_programme: false,
        reinvestissement_dividendes: false,
        origine: "MON_CONSEIL",
        notes: "Lot: Lot 104 Bacchus-Dion | État: Validée comptablement",
        created_at: 0,
        updated_at: 0,
      }
    );
    expect(highlights.montantCentimes).toBe("change");
    expect(highlights.notes).toBeUndefined();
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
    expect(parseImmoPrixTtcCentimes(283792)).toBe(28379200);
    expect(parseImmoPrixTtcCentimes(0)).toBeNull();
    expect(parseImmoPrixTtcCentimes(-100)).toBeNull();
    expect(parseImmoPrixTtcCentimes("187 200")).toBe(18720000);
    expect(parseImmoPrixTtcCentimes("283,792")).toBe(28379200);
    expect(parseImmoPrixTtcCentimes("283 792,00")).toBe(28379200);
    expect(parseImmoPrixTtcCentimes("143 759,42")).toBe(14375942);
  });

  it("pickImmoCommandesSheetName", () => {
    expect(
      pickImmoCommandesSheetName(["Autre", "Investissement Immobilier"])
    ).toBe("Investissement Immobilier");
    expect(pickImmoCommandesSheetName(["Feuille1"])).toBe("Feuille1");
  });

  it("isImmoImportLineSelectable accepte ready et duplicate_crm avec investissementId", () => {
    const ready = { status: "ready", lineKey: "r1" } as ImmoImportPreviewLine;
    const dup = {
      status: "duplicate_crm",
      investissementId: 9,
      lineKey: "d1",
    } as ImmoImportPreviewLine;
    const ambiguous = { status: "duplicate_crm", lineKey: "d2" } as ImmoImportPreviewLine;
    expect(isImmoImportLineSelectable(ready)).toBe(true);
    expect(isImmoImportLineSelectable(dup)).toBe(true);
    expect(isImmoImportLineSelectable(ambiguous)).toBe(false);
    expect(defaultSelectedImmoLineKeys([ready, dup, ambiguous]).size).toBe(2);
  });

  it("parseImmoCommandeRows — Prix TTC formaté Excel (raw:false) + lot", () => {
    const rows = parseImmoCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Marie",
        "Nom Programme": "Programme X",
        "Ville Programme": "VILLE",
        "Dispositif Fiscal": "Pinel",
        "Date Acte": "23/12/2024",
        "Prix TTC": "283,792",
        Lot: "Lot 104 Bacchus-Dion",
      },
    ]);
    expect(isoToDateInput(rows[0]!.dateActeIso)).toBe("2024-12-23");
    expect(rows[0]!.montantCentimes).toBe(28379200);
    expect(rows[0]!.notes).toBe("Lot 104 Bacchus-Dion");
  });

  it("parseImmoCommandeRows — Date Acte JJ/MM/AAAA sans décalage fuseau", () => {
    const rows = parseImmoCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Marie",
        "Nom Programme": "Programme X",
        "Ville Programme": "VILLE",
        "Dispositif Fiscal": "Pinel",
        "Date Acte": "23/12/2024",
        "Prix TTC": 100000,
      },
    ]);
    expect(rows[0]!.dateActeIso).toBe("2024-12-23T00:00:00.000Z");
    expect(isoToDateInput(rows[0]!.dateActeIso)).toBe("2024-12-23");
  });

  it("immoNomProduitMatches — libellés Excel vs CRM (ville/programme inversés)", () => {
    expect(
      immoNomProduitMatches(
        "Songes DOphélia — MONTEUX",
        "Monteux - Songe d'Ophelia"
      )
    ).toBe(true);
    expect(immoNomProduitMatches("Programme X — VILLE", "Programme X — VILLE")).toBe(
      true
    );
    expect(immoNomProduitMatches("Programme X — VILLE", "Autre — VILLE")).toBe(false);
  });

  it("buildImmoCommandesImportPreview — investissement foyer déjà en base (nom produit tolérant)", () => {
    const rows = parseImmoCommandeRows([
      {
        "Nom complet Investisseur": "DUPONT Marie",
        "Co-Investisseur - Nom Prénom": "DUPONT Jean",
        "Nom Programme": "Songes DOphélia",
        "Ville Programme": "MONTEUX",
        "Dispositif Fiscal": "Pinel",
        "Date Acte": "23/12/2024",
        "Prix TTC": 283000,
        Lot: "Lot A108",
      },
    ]);
    const contacts: Contact[] = [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Marie",
        foyer_id: 10,
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
      {
        id: 2,
        nom: "DUPONT",
        prenom: "Jean",
        foyer_id: 10,
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      } as Contact,
    ];
    const investissements: Investissement[] = [
      {
        id: 50,
        foyer_id: 10,
        type_produit: "PINEL",
        nom_produit: "Monteux - Songe d'Ophelia",
        montant_initial: 283_000_00,
        date_souscription: dateInputToUnix("2024-12-24") ?? undefined,
        versement_programme: false,
        reinvestissement_dividendes: false,
        origine: "MON_CONSEIL",
        created_at: 0,
        updated_at: 0,
      },
    ];
    const preview = buildImmoCommandesImportPreview(rows, contacts, investissements);
    expect(preview[0]!.status).toBe("duplicate_crm");
    expect(preview[0]!.investissementId).toBe(50);

    const highlights = getImmoCrmDiffFieldHighlights(preview[0]!, investissements[0]!);
    expect(highlights.nomProduit).toBeUndefined();
    expect(highlights.partenaireNom).toBeUndefined();
    expect(highlights.dateActeIso).toBe("change");
    expect(highlights.montantCentimes).toBeUndefined();
  });
});
