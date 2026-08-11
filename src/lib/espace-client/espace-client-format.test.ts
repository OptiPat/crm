import { describe, expect, it } from "vitest";
import {
  formatEspaceAccesStatut,
  formatEspaceConnexionEvent,
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
