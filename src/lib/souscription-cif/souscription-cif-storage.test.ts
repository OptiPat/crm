import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildDossierStorageKey,
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
        [buildDossierStorageKey(42, "scpi")]: {
          dateDoc: "2026-06-13",
          dateDer: "2026-01-10",
          dateRio: "2026-02-01",
          dateQpi: "2026-02-15",
          lieuNaissance: "Montpellier",
          objectifsClient: "Revenus complémentaires",
          rappelDemande: "",
          rappelSituationClient: "",
          analyseSituationClient: "",
          conseil: "",
          mesPreconisations: "Mes préconisations portent sur un investissement global de 30 000 €",
          scpiAnnexeSouscriptions: [
            {
              productKey: "comete",
              montantSouscritEur: "30000",
              partPriceEur: "250",
              reinvestissementDividendesPct: "100",
              vpMontantEur: "50",
              vpFrequence: "mois",
            },
          ],
          quotePartPercueConsultantCifEur: "",
          provenanceFonds: "dom_tom",
          origineFondsSelected: ["reemploi"],
          origineFondsAutrePrecision: "",
        },
      },
    });

    const loaded = loadSouscriptionCifDraft();
    expect(loaded?.selectedContactId).toBe(42);
    expect(getDossierForContact(loaded!.dossiersByContactId, 42, "scpi").lieuNaissance).toBe(
      "Montpellier"
    );
    expect(getDossierForContact(loaded!.dossiersByContactId, 42, "scpi").provenanceFonds).toBe(
      "dom_tom"
    );
    expect(
      getDossierForContact(loaded!.dossiersByContactId, 42, "scpi").origineFondsSelected
    ).toEqual(["reemploi"]);
  });

  it("migre les brouillons anciens (clé contact seul → contact:scpi)", () => {
    storage.set(
      "crm_souscription_cif_draft",
      JSON.stringify({
        version: 1,
        productType: "scpi",
        activeDocument: "lettre-mission",
        selectedContactId: 7,
        dossiersByContactId: {
          "7": {
            dateDoc: "2026-06-13",
            dateDer: "",
            dateRio: "",
            dateQpi: "",
            lieuNaissance: "Paris",
            objectifsClient: "",
            rappelDemande: "",
            rappelSituationClient: "",
            analyseSituationClient: "",
            conseil: "",
            mesPreconisations: "",
            scpiAnnexeSouscriptions: [],
            quotePartPercueConsultantCifEur: "",
            provenanceFonds: "",
            origineFondsSelected: [],
            origineFondsAutrePrecision: "",
          },
        },
        savedAt: Date.now(),
      })
    );

    const loaded = loadSouscriptionCifDraft();
    expect(getDossierForContact(loaded!.dossiersByContactId, 7, "scpi").lieuNaissance).toBe(
      "Paris"
    );
    expect(loaded?.dossiersByContactId["7"]).toBeUndefined();
  });

  it("isole les dossiers par client", () => {
    const dossiers = {
      [buildDossierStorageKey(1, "scpi")]: {
        ...getDossierForContact({}, 1, "scpi"),
        lieuNaissance: "Lyon",
      },
      [buildDossierStorageKey(2, "scpi")]: {
        ...getDossierForContact({}, 2, "scpi"),
        lieuNaissance: "Nice",
      },
    };

    expect(getDossierForContact(dossiers, 1, "scpi").lieuNaissance).toBe("Lyon");
    expect(getDossierForContact(dossiers, 2, "scpi").lieuNaissance).toBe("Nice");
  });
});
