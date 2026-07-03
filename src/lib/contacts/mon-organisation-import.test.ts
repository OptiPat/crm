import { describe, it, expect } from "vitest";
import { MON_ORGANISATION_SAMPLE_ROWS } from "./__fixtures__/mon-organisation-fixture";
import {
  buildMonOrganisationImportPreview,
  cleanMonOrganisationTelephone,
  parseMonOrganisationParrain,
  parseMonOrganisationRows,
  stripMonOrganisationDisplayPrefix,
  summarizeMonOrganisationImportPreview,
} from "./mon-organisation-import";

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
});
