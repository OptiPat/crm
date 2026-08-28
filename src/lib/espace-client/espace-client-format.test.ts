import { describe, expect, it } from "vitest";
import {
  formatEspaceAccesStatut,
  formatEspaceConnexionEvent,
  formatEspaceImportSummaryParts,
  formatEspaceSyncLabel,
  ESPACE_ACCES_STATUT,
} from "./espace-client-format";

describe("formatEspaceAccesStatut", () => {
  it("libellés français", () => {
    expect(formatEspaceAccesStatut(ESPACE_ACCES_STATUT.ACTIF)).toBe("Actif");
    expect(formatEspaceAccesStatut(ESPACE_ACCES_STATUT.REVOQUE)).toBe("Révoqué");
    expect(formatEspaceAccesStatut(ESPACE_ACCES_STATUT.INACTIF)).toBe("Inactif");
  });
});

describe("formatEspaceConnexionEvent", () => {
  it("libellé nouvel appareil", () => {
    expect(formatEspaceConnexionEvent("new_device")).toBe("Nouvel appareil");
  });
});

describe("formatEspaceSyncLabel", () => {
  it("retourne null sans date", () => {
    expect(formatEspaceSyncLabel(null)).toBeNull();
    expect(formatEspaceSyncLabel(0)).toBeNull();
  });

  it("formate une date unix", () => {
    const label = formatEspaceSyncLabel(1_700_000_000);
    expect(label).toMatch(/\d/);
  });
});

describe("formatEspaceImportSummaryParts", () => {
  it("n'affiche rien sans compteur", () => {
    expect(
      formatEspaceImportSummaryParts({
        imported: 0,
        scpiDeclarationsImported: 0,
        avoirsImported: 0,
        avoirsRetires: 0,
        declareClientPromoted: 0,
      })
    ).toEqual([]);
  });

  it("liste les compteurs non nuls", () => {
    expect(
      formatEspaceImportSummaryParts({
        imported: 2,
        scpiDeclarationsImported: 1,
        avoirsImported: 3,
        avoirsRetires: 1,
        declareClientPromoted: 2,
      })
    ).toEqual([
      "2 document(s) importé(s) dans la GED",
      "1 mise(s) à jour importée(s)",
      "3 avoir(s) déclaré(s) importé(s)",
      "2 déclaration(s) reprise(s) à côté",
      "1 avoir(s) retiré(s)",
    ]);
  });
});
