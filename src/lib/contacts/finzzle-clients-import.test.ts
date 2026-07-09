import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { FINZZLE_SAMPLE_CSV } from "./__fixtures__/import-finzzle-fixture";
import {
  buildFinzzleClientsImportPreview,
  defaultSelectedFinzzleClientLineKeys,
  getFinzzleEnrichFieldHighlights,
  groupFinzzleClientPreviewLines,
  isFinzzleClientsExport,
  parseFinzzleClientRows,
  pickEnrichClientCategory,
  reassessFinzzleClientsPreview,
  resolveEnrichDateNaissance,
  summarizeFinzzleClientsImportPreview,
  type FinzzleClientPreviewLine,
} from "./finzzle-clients-import";
import type { Contact } from "@/lib/api/tauri-contacts";

describe("finzzle-clients-import", () => {
  const readFixtureRows = () => {
    const wb = XLSX.read(FINZZLE_SAMPLE_CSV, { type: "string", raw: true });
    const sheet = wb.Sheets[wb.SheetNames[0]!]!;
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  };

  it("isFinzzleClientsExport detecte le modele Finzzle", () => {
    const rows = readFixtureRows();
    const headers = Object.keys(rows[0] ?? {});
    expect(isFinzzleClientsExport(headers)).toBe(true);
  });

  it("parseFinzzleClientRows mappe statut, coords et TMI", () => {
    const rows = parseFinzzleClientRows(readFixtureRows());
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      nom: "DUPONT",
      prenom: "Marie",
      categorie: "CLIENT",
      civilite: "MME",
      email: "marie.dupont@example.com",
      sourceLead: "Ami",
      tmi: "11 %",
    });
    expect(rows[0]!.telephone).toBe("+33 6 00 00 00 01");
    expect(rows[0]!.dateNaissanceIso?.slice(0, 10)).toBe("1985-03-05");
    expect(rows[1]!.categorie).toBe("PROSPECT_CLIENT");
    expect(rows[2]!.categorie).toBe("SUSPECT_CLIENT");
  });

  it("buildFinzzleClientsImportPreview enrichit un contact existant par nom", () => {
    const parsed = parseFinzzleClientRows(readFixtureRows());
    const preview = buildFinzzleClientsImportPreview(parsed, [
      {
        id: 1,
        nom: "BERNARD",
        prenom: "Luc",
        email: "luc.bernard@example.com",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    const summary = summarizeFinzzleClientsImportPreview(preview);
    expect(summary.ready).toBe(2);
    expect(summary.enrich).toBe(1);
    const bernard = preview.find((l) => l.nom === "BERNARD");
    expect(bernard?.status).toBe("enrich");
    expect(bernard?.contactId).toBe(1);
  });

  it("detecte homonyme si nom identique mais email different", () => {
    const parsed = parseFinzzleClientRows(readFixtureRows());
    const preview = buildFinzzleClientsImportPreview(parsed, [
      {
        id: 2,
        nom: "BERNARD",
        prenom: "Luc",
        email: "autre@example.com",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    const bernard = preview.find((l) => l.nom === "BERNARD");
    expect(bernard?.status).toBe("duplicate_homonym");
  });

  it("mode merge transforme homonyme en ready", () => {
    const parsed = parseFinzzleClientRows(readFixtureRows());
    let preview = buildFinzzleClientsImportPreview(parsed, [
      {
        id: 2,
        nom: "BERNARD",
        prenom: "Luc",
        email: "autre@example.com",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    preview = reassessFinzzleClientsPreview(preview, [], "merge");
    const bernard = preview.find((l) => l.nom === "BERNARD");
    expect(bernard?.status).toBe("ready");
  });

  it("bloque enrichissement email si noms differents", () => {
    const parsed = parseFinzzleClientRows(readFixtureRows());
    const preview = buildFinzzleClientsImportPreview(parsed, [
      {
        id: 3,
        nom: "AUTRE",
        prenom: "Nom",
        email: "luc.bernard@example.com",
        categorie: "PROSPECT_CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    const luc = preview.find((l) => l.prenom === "Luc");
    expect(luc?.status).toBe("duplicate_homonym");
    expect(luc?.duplicateMatch).toBe("email");
    expect(luc?.identityConflict).toBe(true);
    expect(luc?.conflictReasons).toContain("noms différents");
  });

  it("bloque enrichissement email si telephones differents", () => {
    const parsed = parseFinzzleClientRows(readFixtureRows());
    const preview = buildFinzzleClientsImportPreview(parsed, [
      {
        id: 3,
        nom: "AUTRE",
        prenom: "Nom",
        email: "luc.bernard@example.com",
        telephone: "+33 6 11 11 11 11",
        categorie: "PROSPECT_CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    const luc = preview.find((l) => l.prenom === "Luc");
    expect(luc?.status).toBe("duplicate_homonym");
    expect(luc?.duplicateMatch).toBe("email");
    expect(luc?.identityConflict).toBe(true);
  });

  it("pickEnrichClientCategory ne retrograde pas un client", () => {
    expect(pickEnrichClientCategory("CLIENT", "PROSPECT_CLIENT")).toBe("CLIENT");
    expect(pickEnrichClientCategory("CLIENT", "SUSPECT_CLIENT")).toBe("CLIENT");
    expect(pickEnrichClientCategory("SUSPECT_CLIENT", "CLIENT")).toBe("CLIENT");
    expect(pickEnrichClientCategory("PROSPECT_CLIENT", "SUSPECT_CLIENT")).toBe(
      "PROSPECT_CLIENT"
    );
  });

  it("pickEnrichClientCategory preserve filleul et prescripteur", () => {
    expect(
      pickEnrichClientCategory("AUCUN", "CLIENT", "PROSPECT_FILLEUL")
    ).toBe("AUCUN");
    expect(pickEnrichClientCategory("PRESCRIPTEUR", "CLIENT")).toBe("PRESCRIPTEUR");
  });

  it("resolveEnrichDateNaissance conserve la date CRM", () => {
    const existingUnix = Math.floor(new Date("1980-03-15T00:00:00Z").getTime() / 1000);
    expect(
      resolveEnrichDateNaissance(existingUnix, "1985-03-05T00:00:00.000Z")?.slice(0, 10)
    ).toBe("1980-03-15");
    expect(
      resolveEnrichDateNaissance(undefined, "1985-03-05T00:00:00.000Z")?.slice(0, 10)
    ).toBe("1985-03-05");
  });

  it("getFinzzleEnrichFieldHighlights signale complétion et changement", () => {
    const existing: Contact = {
      id: 1,
      nom: "DUPONT",
      prenom: "Marie",
      email: "marie.dupont@example.com",
      categorie: "PROSPECT_CLIENT",
      statut_suivi: "ACTIF",
      created_at: 0,
      updated_at: 0,
    };
    const line = {
      rowIndex: 2,
      lineKey: "k1",
      status: "enrich",
      statusMessage: "",
      categorie: "CLIENT",
      civilite: "MME",
      nom: "DUPONT",
      prenom: "Marie",
      email: "marie.dupont@example.com",
      telephone: "+33612345678",
      adresse: "12 rue des Acacias",
      codePostal: "75001",
      ville: "Paris",
      pays: "France",
      sourceLead: "Finzzle",
      tmi: "30",
      duplicateMatch: "name",
    } as FinzzleClientPreviewLine;

    expect(getFinzzleEnrichFieldHighlights(line, existing)).toEqual({
      categorie: "change",
      civilite: "fill",
      telephone: "fill",
      adresse: "fill",
      codePostal: "fill",
      ville: "fill",
      pays: "fill",
      sourceLead: "fill",
      tmi: "fill",
    });
  });

  it("getFinzzleEnrichFieldHighlights ignore nom si match email", () => {
    const existing: Contact = {
      id: 1,
      nom: "DUPONT",
      prenom: "Marie",
      email: "marie.dupont@example.com",
      telephone: "+33600000001",
      categorie: "CLIENT",
      statut_suivi: "ACTIF",
      created_at: 0,
      updated_at: 0,
    };
    const line = {
      rowIndex: 2,
      lineKey: "k2",
      status: "enrich",
      statusMessage: "",
      categorie: "CLIENT",
      civilite: "",
      nom: "AUTRE",
      prenom: "Nom",
      email: "marie.dupont@example.com",
      telephone: "+33612345678",
      adresse: "",
      codePostal: "",
      ville: "",
      pays: "",
      sourceLead: "",
      tmi: "",
      duplicateMatch: "email",
    } as FinzzleClientPreviewLine;

    expect(getFinzzleEnrichFieldHighlights(line, existing)).toEqual({
      telephone: "change",
    });
  });

  it("groupFinzzleClientPreviewLines classe par statut", () => {
    const parsed = parseFinzzleClientRows(readFixtureRows());
    const preview = buildFinzzleClientsImportPreview(parsed, [
      {
        id: 1,
        nom: "DUPONT",
        prenom: "Marie",
        email: "marie.dupont@example.com",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
      {
        id: 2,
        nom: "BERNARD",
        prenom: "Luc",
        email: "autre@example.com",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    const groups = groupFinzzleClientPreviewLines(preview);
    expect(groups.map((g) => g.status)).toEqual(["enrich", "ready", "duplicate_homonym"]);
    expect(groups[0]!.label).toBe("Enrichir");
    expect(groups[1]!.label).toBe("À importer");
    expect(groups[2]!.label).toBe("Homonyme");
  });

  it("mode skip ne preselectionne pas les enrich", () => {
    const parsed = parseFinzzleClientRows(readFixtureRows());
    const preview = buildFinzzleClientsImportPreview(parsed, [
      {
        id: 1,
        nom: "BERNARD",
        prenom: "Luc",
        email: "luc.bernard@example.com",
        categorie: "CLIENT",
        statut_suivi: "ACTIF",
        created_at: 0,
        updated_at: 0,
      },
    ]);
    const selected = defaultSelectedFinzzleClientLineKeys(preview, "skip");
    expect(selected.has(preview.find((l) => l.nom === "BERNARD")!.lineKey)).toBe(false);
    expect(selected.size).toBe(2);
  });
});
