import { describe, expect, it } from "vitest";
import type { Document } from "@/lib/api/tauri-documents";
import {
  computeClientDocumentCompliance,
  identityDocumentBucket,
  isCniExpired,
  isPassportExpired,
  isSignatureAtLeastOneYearOld,
} from "@/lib/documents/client-document-compliance";

function doc(overrides: Partial<Document> = {}): Document {
  return {
    id: 1,
    type_document: "AUTRE",
    nom_fichier: "a.pdf",
    chemin_fichier: "/a.pdf",
    taille_fichier: 1000,
    created_at: 100,
    updated_at: 100,
    ...overrides,
  };
}

const ref = new Date("2026-07-19T12:00:00");

describe("client-document-compliance", () => {
  it("détecte RIO signé depuis au moins 1 an", () => {
    expect(isSignatureAtLeastOneYearOld("2025-07-19", ref)).toBe(true);
    expect(isSignatureAtLeastOneYearOld("2025-07-20", ref)).toBe(false);
  });

  it("passeport périmé dès la date de validité dépassée", () => {
    expect(isPassportExpired("2026-07-18", ref)).toBe(true);
    expect(isPassportExpired("2026-07-19", ref)).toBe(false);
  });

  it("CNI : tolérance 5 ans après la date imprimée", () => {
    expect(isCniExpired("2021-07-19", ref)).toBe(true);
    expect(isCniExpired("2021-07-20", ref)).toBe(false);
    expect(isCniExpired("2026-07-18", ref)).toBe(false);
  });

  it("signale manquants et ancienneté pour un dossier client", () => {
    const result = computeClientDocumentCompliance(
      [
        doc({
          id: 1,
          type_document: "PATRIMOINE",
          date_document: "2024-01-15",
        }),
        doc({
          id: 2,
          type_document: "IDENTITE",
          nom_fichier: "cni_dupont.pdf",
          date_document: "2028-12-31",
        }),
      ],
      { referenceDate: ref }
    );
    expect(result.typeBadges).toEqual(["rio", "identite"]);
    expect(result.alerts.map((a) => a.id)).toEqual([
      "rio_stale",
      "qpi_missing",
    ]);
  });

  it("distingue passeport et CNI", () => {
    const result = computeClientDocumentCompliance(
      [
        doc({
          id: 1,
          type_document: "IDENTITE",
          nom_fichier: "passeport_dupont.pdf",
          date_document: "2026-07-18",
        }),
        doc({
          id: 2,
          type_document: "IDENTITE",
          nom_fichier: "cni_dupont.pdf",
          date_document: "2021-07-19",
        }),
      ],
      { referenceDate: ref }
    );
    expect(result.typeBadges).toEqual(["identite", "passeport"]);
    expect(result.alerts.map((a) => a.id)).toEqual([
      "rio_missing",
      "qpi_missing",
      "cni_expired",
      "passport_expired",
    ]);
  });

  it("fichier identité ambigu : validité stricte et alerte de renommage", () => {
    expect(identityDocumentBucket(doc({ type_document: "IDENTITE", nom_fichier: "IMG_1234.pdf" }))).toBe(
      "ambiguous"
    );
    const result = computeClientDocumentCompliance(
      [
        doc({
          id: 1,
          type_document: "IDENTITE",
          nom_fichier: "IMG_1234.pdf",
          date_document: "2026-07-18",
        }),
      ],
      { referenceDate: ref }
    );
    expect(result.typeBadges).toEqual([]);
    expect(result.alerts.map((a) => a.id)).toEqual([
      "rio_missing",
      "qpi_missing",
      "identite_ambiguous",
      "identite_expired",
    ]);
  });

  it("signale les dates manquantes", () => {
    const result = computeClientDocumentCompliance(
      [
        doc({ id: 1, type_document: "PATRIMOINE" }),
        doc({ id: 2, type_document: "QPI" }),
        doc({
          id: 3,
          type_document: "IDENTITE",
          nom_fichier: "cni_dupont.pdf",
        }),
      ],
      { referenceDate: ref }
    );
    expect(result.alerts.map((a) => a.id)).toEqual([
      "rio_date_missing",
      "qpi_date_missing",
      "cni_date_missing",
    ]);
  });

  it("prend le document le plus récent par type", () => {
    const result = computeClientDocumentCompliance(
      [
        doc({
          id: 1,
          type_document: "QPI",
          date_document: "2020-01-01",
        }),
        doc({
          id: 2,
          type_document: "QPI",
          date_document: "2025-08-01",
        }),
      ],
      { referenceDate: ref }
    );
    expect(result.alerts.some((a) => a.id === "qpi_stale")).toBe(false);
  });

  it("sans-client : pas d'alertes manquantes mais expiration conservée", () => {
    const empty = computeClientDocumentCompliance([doc()], {
      checkMissing: false,
    });
    expect(empty.alerts).toEqual([]);

    const expired = computeClientDocumentCompliance(
      [
        doc({
          type_document: "IDENTITE",
          nom_fichier: "passeport.pdf",
          date_document: "2026-07-18",
        }),
      ],
      { checkMissing: false, referenceDate: ref }
    );
    expect(expired.alerts.map((a) => a.id)).toEqual(["passport_expired"]);
  });
});
