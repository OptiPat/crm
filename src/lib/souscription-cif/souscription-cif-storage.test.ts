import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  getDossierForContact,
  loadSouscriptionCifDraft,
  saveSouscriptionCifDraft,
} from "@/lib/souscription-cif/souscription-cif-storage";

describe("souscription-cif-storage", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => {
        storage.set(k, v);
      },
      removeItem: (k: string) => {
        storage.delete(k);
      },
    });
  });

  it("persists client and dossier fields", () => {
    saveSouscriptionCifDraft({
      productType: "scpi",
      activeDocument: "lettre-mission",
      selectedContactId: 42,
      dossiersByContactId: {
        "42": {
          dateDoc: "2026-06-13",
          dateDer: "2026-01-10",
          dateRio: "2026-02-01",
          dateQpi: "2026-02-15",
          lieuNaissance: "Montpellier",
          objectifsClient: "Revenus complémentaires",
          rappelDemande: "",
          rappelSituationClient: "",
          conseil: "",
          mesPreconisations: "",
          scpiAnnexeProductKeys: [],
          quotePartPercueConsultantCifEur: "",
        },
      },
    });

    const loaded = loadSouscriptionCifDraft();
    expect(loaded?.selectedContactId).toBe(42);
    expect(getDossierForContact(loaded!.dossiersByContactId, 42).lieuNaissance).toBe(
      "Montpellier"
    );
  });
});
