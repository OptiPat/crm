import { describe, expect, it } from "vitest";
import {
  assessRioImport,
  listMissingConfidenceFields,
  STELLIUM_IMPORT_MIN_CONFIDENCE,
} from "./rio-import-guard";
import type { ExtractedData } from "@/lib/pdf";

describe("rio-import-guard", () => {
  it("autorise un RIO Stellium avec confiance suffisante", () => {
    const data: ExtractedData = {
      typeDocument: "RIO",
      nom: "LEGRAND",
      prenom: "Paul",
      email: "a@b.fr",
      patrimoineTotal: 100_000,
      confidence: 80,
    };
    const assessment = assessRioImport(data);
    expect(assessment.canProceed).toBe(true);
    expect(assessment.formatLabel).toContain("RIO");
  });

  it("bloque si confiance sous le seuil", () => {
    const data: ExtractedData = {
      typeDocument: "RIO",
      nom: "X",
      prenom: "Y",
      confidence: STELLIUM_IMPORT_MIN_CONFIDENCE - 1,
    };
    expect(assessRioImport(data).canProceed).toBe(false);
  });

  it("bloque un parse générique silencieux", () => {
    const data: ExtractedData = { confidence: 10 };
    const assessment = assessRioImport(data);
    expect(assessment.canProceed).toBe(false);
    expect(assessment.issues[0]).toMatch(/RIO ou QPI Stellium/);
  });

  it("avertit si type sélectionné ≠ document détecté", () => {
    const data: ExtractedData = {
      typeDocument: "QPI",
      nom: "DUPONT",
      prenom: "Jean",
      profilRisque: 4,
      confidence: 85,
    };
    const assessment = assessRioImport(data, { requestedType: "PATRIMOINE" });
    expect(assessment.canProceed).toBe(true);
    expect(assessment.warnings.some((w) => w.includes("QPI"))).toBe(true);
  });

  it("liste les champs manquants QPI", () => {
    expect(listMissingConfidenceFields({ typeDocument: "QPI" }, "QPI")).toContain("profil SRI");
    expect(listMissingConfidenceFields({ typeDocument: "QPI" }, "QPI")).toContain(
      "date de signature"
    );
  });

  it("liste la date de signature manquante pour RIO", () => {
    expect(listMissingConfidenceFields({ typeDocument: "RIO" }, "RIO")).toContain(
      "date de signature"
    );
    expect(
      listMissingConfidenceFields(
        { typeDocument: "RIO", dateSignature: "15/06/2026" },
        "RIO"
      )
    ).not.toContain("date de signature");
  });

  it("avertit si peu de lignes colonnes dans un RIO couple tabulé", () => {
    const data: ExtractedData = {
      typeDocument: "RIO",
      isCouple: true,
      nom: "DURAND",
      prenom: "Claire",
      email: "a@b.fr",
      patrimoineTotal: 100_000,
      confidence: 80,
      raw: "Recueil d'informations\nInvestisseur : A et B\nD'activité\t1 000 €\t2 000 €",
    };
    const assessment = assessRioImport(data);
    expect(assessment.canProceed).toBe(true);
    expect(assessment.warnings.some((w) => w.includes("colonnes"))).toBe(true);
  });
});
