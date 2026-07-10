import { describe, it, expect } from "vitest";
import { MON_ORGANISATION_SAMPLE_ROWS } from "./__fixtures__/mon-organisation-fixture";
import {
  buildMonOrganisationImportPreview,
  cleanMonOrganisationTelephone,
  defaultSelectedMonOrganisationLineKeys,
  getMonOrganisationCrmDiffFieldHighlights,
  groupMonOrganisationPreviewLines,
  isMonOrganisationLineSelectable,
  parseMonOrganisationParrain,
  parseMonOrganisationRows,
  stripMonOrganisationDisplayPrefix,
  summarizeMonOrganisationImportPreview,
  type MonOrganisationPreviewLine,
} from "./mon-organisation-import";
import type { Contact } from "@/lib/api/tauri-contacts";

describe("mon-organisation-import", () => {
  it("stripMonOrganisationDisplayPrefix retire les artefacts niveau", () => {
    expect(stripMonOrganisationDisplayPrefix("/__ (01) BERNARD Luc")).toBe("BERNARD Luc");
    expect(stripMonOrganisationDisplayPrefix("/____ (02) MARTIN Sophie")).toBe("MARTIN Sophie");
    expect(stripMonOrganisationDisplayPrefix("DUPONT Jean")).toBe("DUPONT Jean");
  });

  it("parseMonOrganisationParrain extrait nom et prénom", () => {
    const p = parseMonOrganisationParrain("LEGRAND Paul");
    expect(p).toEqual({ nom: "LEGRAND", prenom: "Paul", label: "Paul LEGRAND" });
  });

  it("cleanMonOrganisationTelephone nettoie le format Finzzle", () => {
    expect(cleanMonOrganisationTelephone("+ () 06.12.34.56.78")).toBe("06 12 34 56 78");
    expect(cleanMonOrganisationTelephone('="+33600000002"')).toBe("+33 6 00 00 00 02");
    expect(cleanMonOrganisationTelephone("+ () 33 06.08.35.52.99")).toBe("+33 6 08 35 52 99");
  });

  it("parseMonOrganisationRows mappe les colonnes Mon Organisation", () => {
    const rows = parseMonOrganisationRows(MON_ORGANISATION_SAMPLE_ROWS);
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      nom: "DUPONT",
      prenom: "Jean",
      niveau: "00",
      parrainNom: "LEGRAND",
      parrainPrenom: "Paul",
      email: "jean.dupont@example.com",
    });
    expect(rows[0]!.dateInscriptionIso?.slice(0, 10)).toBe("2018-07-10");
    expect(rows[1]!.niveau).toBe("01");
    expect(rows[2]!.parrainNom).toBe("BERNARD");
  });

  it("parseMonOrganisationRows lit 04/02/2021 sans décalage", () => {
    const rows = parseMonOrganisationRows([
      {
        Nom: "TEST",
        Prénom: "User",
        "Niveau hiérarchique": "01",
        Parrain: "LEGRAND Paul",
        "Date Entrée": "04/02/2021",
        "Mail Information": "test@example.com",
        "Téléphone Mobile": "0612345678",
      },
    ]);
    expect(rows[0]!.dateInscriptionIso?.slice(0, 10)).toBe("2021-02-04");
  });

  it("parseMonOrganisationRows normalise ville et pays", () => {
    const rows = parseMonOrganisationRows([
      {
        Nom: "TEST",
        Prénom: "User",
        "Niveau hiérarchique": "01",
        Parrain: "LEGRAND Paul",
        "Date Entrée": "01/01/2020",
        Ville: "ST AUNES",
        Pays: "FRANCE",
        "Mail Information": "test@example.com",
      },
    ]);
    expect(rows[0]!.ville).toBe("St Aunes");
    expect(rows[0]!.pays).toBe("France");
  });

  it("buildMonOrganisationImportPreview détecte les doublons CRM", () => {
    const rows = parseMonOrganisationRows(MON_ORGANISATION_SAMPLE_ROWS);
    const preview = buildMonOrganisationImportPreview(rows, [
      {
        id: 1,
        nom: "BERNARD",
        prenom: "Luc",
        categorie: "AUCUN",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    const summary = summarizeMonOrganisationImportPreview(preview);
    expect(summary.ready).toBe(2);
    expect(summary.duplicateCrm).toBe(1);
    const dup = preview.find((l) => l.nom === "BERNARD");
    expect(dup?.status).toBe("duplicate_crm");
  });

  it("isMonOrganisationLineSelectable accepte ready et duplicate_crm", () => {
    const ready = { status: "ready", contactId: undefined } as MonOrganisationPreviewLine;
    const dup = { status: "duplicate_crm", contactId: 1 } as MonOrganisationPreviewLine;
    const dupNoId = { status: "duplicate_crm" } as MonOrganisationPreviewLine;
    expect(isMonOrganisationLineSelectable(ready)).toBe(true);
    expect(isMonOrganisationLineSelectable(dup)).toBe(true);
    expect(isMonOrganisationLineSelectable(dupNoId)).toBe(false);
    expect(isMonOrganisationLineSelectable({ status: "invalid" } as MonOrganisationPreviewLine)).toBe(
      false
    );
  });

  it("defaultSelectedMonOrganisationLineKeys sélectionne ready et duplicate_crm", () => {
    const rows = parseMonOrganisationRows(MON_ORGANISATION_SAMPLE_ROWS);
    const preview = buildMonOrganisationImportPreview(rows, [
      {
        id: 1,
        nom: "BERNARD",
        prenom: "Luc",
        categorie: "AUCUN",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    const selected = defaultSelectedMonOrganisationLineKeys(preview);
    expect(selected.size).toBe(3);
    expect(preview.every((line) => isMonOrganisationLineSelectable(line) && selected.has(line.lineKey))).toBe(
      true
    );
  });

  it("groupMonOrganisationPreviewLines classe par statut", () => {
    const rows = parseMonOrganisationRows(MON_ORGANISATION_SAMPLE_ROWS);
    const preview = buildMonOrganisationImportPreview(rows, [
      {
        id: 1,
        nom: "BERNARD",
        prenom: "Luc",
        categorie: "AUCUN",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    const groups = groupMonOrganisationPreviewLines(preview);
    expect(groups.map((g) => g.status)).toEqual(["ready", "duplicate_crm"]);
    expect(groups[0]!.label).toBe("À importer");
    expect(groups[1]!.label).toBe("Déjà en base");
  });

  it("getMonOrganisationCrmDiffFieldHighlights signale les écarts CRM", () => {
    const existing: Contact = {
      id: 1,
      nom: "BERNARD",
      prenom: "Luc",
      email: "ancien@example.com",
      categorie: "AUCUN",
      filleul_categorie: "PROSPECT_FILLEUL",
      statut_suivi: "ACTIF",
      created_at: 0,
      updated_at: 0,
    };
    const line = {
      rowIndex: 4,
      lineKey: "k1",
      status: "duplicate_crm",
      statusMessage: "",
      niveau: "02",
      nom: "BERNARD",
      prenom: "Luc",
      email: "luc.bernard@example.com",
      telephone: "+33612345678",
      adresse: "8 place du Marché",
      codePostal: "69001",
      ville: "Lyon",
      pays: "France",
      dateInscriptionIso: "2019-06-01T00:00:00.000Z",
      parrainNom: "DUPONT",
      parrainPrenom: "Jean",
      parrainLabel: "Jean DUPONT",
      filleulCategorie: "FILLEUL",
    } as MonOrganisationPreviewLine;

    expect(getMonOrganisationCrmDiffFieldHighlights(line, existing, [])).toEqual({
      email: "change",
      telephone: "fill",
      adresse: "fill",
      codePostal: "fill",
      ville: "fill",
      pays: "fill",
      dateInscriptionIso: "fill",
      parrainLabel: "fill",
      filleulCategorie: "change",
    });
  });

  it("getMonOrganisationCrmDiffFieldHighlights ne surligne pas inscription si notes CRM", () => {
    const existing: Contact = {
      id: 1,
      nom: "CARRASCO",
      prenom: "Mélanie",
      categorie: "AUCUN",
      statut_suivi: "ACTIF",
      notes: "Date inscription: 04/02/2021\n\nAutre note",
      filleul_categorie: "FILLEUL",
      created_at: 0,
      updated_at: 0,
    };
    const line = {
      rowIndex: 4,
      lineKey: "k3",
      status: "duplicate_crm",
      statusMessage: "",
      niveau: "01",
      nom: "CARRASCO",
      prenom: "Mélanie",
      email: "melanie@example.com",
      telephone: "",
      adresse: "",
      codePostal: "",
      ville: "",
      pays: "",
      dateInscriptionIso: "2021-02-04T00:00:00.000Z",
      parrainNom: "",
      parrainPrenom: "",
      parrainLabel: "",
      filleulCategorie: "FILLEUL",
    } as MonOrganisationPreviewLine;

    expect(getMonOrganisationCrmDiffFieldHighlights(line, existing, [])).toEqual({
      email: "fill",
    });
  });
});
