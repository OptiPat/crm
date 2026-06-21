import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  buildStelliumContratsImportPreview,
  computeStelliumPerfPct,
  famillesNomFromTitulaire,
  markStelliumLineImported,
  parseStelliumContratsCsvRows,
  parseStelliumEuroToCentimes,
  resolveStelliumPerfEuroCentimes,
  summarizeStelliumImportPreview,
  type StelliumImportInvestissementRef,
} from "./stellium-contrats-import";

const SAMPLE_HEADERS: Record<string, unknown> = {
  "N° de contrat": "100001",
  Titulaire: "DUPONT Jean",
  Enveloppe: "Assurance Vie",
  Contrat: "CRISTALLIANCE AVENIR",
  Partenaire: "SurAvenir",
  Valorisation: "10 500,00",
  "Montant total des versements nets": "10 000,00",
  "Montant total des rachats bruts": "0,00",
  "Performance financière en euros (perf du contrat)": "500,00",
  "Date de valorisation": "19/06/2026",
};

function sampleInv(overrides: Partial<Investissement> = {}): Investissement {
  return {
    id: 42,
    type_produit: "ASSURANCE_VIE",
    nom_produit: "Cristalliance",
    numero_contrat: "100001",
    versement_programme: false,
    reinvestissement_dividendes: false,
    origine: "MON_CONSEIL",
    created_at: 0,
    updated_at: 0,
    ...overrides,
  };
}

describe("parseStelliumEuroToCentimes", () => {
  it("parse montants français", () => {
    expect(parseStelliumEuroToCentimes("10 500,00")).toBe(1_050_000);
    expect(parseStelliumEuroToCentimes("Non disponible")).toBeNull();
  });
});

describe("computeStelliumPerfPct", () => {
  it("calcule gain / versements nets", () => {
    expect(
      computeStelliumPerfPct(1_050_000, 1_000_000, 0)
    ).toBeCloseTo(5, 5);
  });
});

describe("parseStelliumContratsCsvRows", () => {
  it("extrait n° contrat, valorisation et date", () => {
    const rows = parseStelliumContratsCsvRows([SAMPLE_HEADERS]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.numeroContrat).toBe("100001");
    expect(rows[0]?.contratLibelle).toBe("CRISTALLIANCE AVENIR");
    expect(rows[0]?.valorisationCentimes).toBe(1_050_000);
    expect(rows[0]?.dateValorisationIso).toMatch(/^2026-06-19/);
  });
});

describe("resolveStelliumPerfEuroCentimes", () => {
  it("prend la colonne Excel si renseignée", () => {
    expect(
      resolveStelliumPerfEuroCentimes({
        valorisationCentimes: 1_050_000,
        versementsNetsCentimes: 1_000_000,
        rachatsCentimes: 0,
        perfEuroCentimes: 500_000,
      })
    ).toBe(500_000);
  });

  it("calcule valorisation − versements nets si colonne absente", () => {
    expect(
      resolveStelliumPerfEuroCentimes({
        valorisationCentimes: 1_050_000,
        versementsNetsCentimes: 1_000_000,
        rachatsCentimes: 0,
        perfEuroCentimes: null,
      })
    ).toBe(50_000);
  });
});

describe("buildStelliumContratsImportPreview", () => {
  it("ready quand match unique et encours différent", () => {
    const csvRows = parseStelliumContratsCsvRows([SAMPLE_HEADERS]);
    const lines = buildStelliumContratsImportPreview(csvRows, [
      sampleInv({ encours_actuel: 1_000_000 }),
    ]);
    expect(lines[0]?.status).toBe("ready");
    expect(lines[0]?.investissementId).toBe(42);
  });

  it("unchanged si encours, versements nets et perf identiques", () => {
    const csvRows = parseStelliumContratsCsvRows([SAMPLE_HEADERS]);
    const lines = buildStelliumContratsImportPreview(csvRows, [
      sampleInv({
        encours_actuel: 1_050_000,
        encours_date: Math.floor(Date.parse("2026-06-19T00:00:00.000Z") / 1000),
        stellium_versements_nets_centimes: 1_000_000,
        stellium_perf_euro_centimes: 50_000,
      }),
    ]);
    expect(lines[0]?.status).toBe("unchanged");
  });

  it("not_found sans n° en CRM", () => {
    const csvRows = parseStelliumContratsCsvRows([SAMPLE_HEADERS]);
    const lines = buildStelliumContratsImportPreview(csvRows, [
      sampleInv({ numero_contrat: "999999" }),
    ]);
    expect(lines[0]?.status).toBe("not_found");
  });

  it("duplicate_crm si deux investissements même n°", () => {
    const csvRows = parseStelliumContratsCsvRows([SAMPLE_HEADERS]);
    const lines = buildStelliumContratsImportPreview(csvRows, [
      sampleInv({ id: 1 }),
      sampleInv({ id: 2 }),
    ]);
    expect(lines[0]?.status).toBe("duplicate_crm");
  });

  it("matche malgré zéros en tête différents CRM / CSV", () => {
    const csvRows = parseStelliumContratsCsvRows([
      { ...SAMPLE_HEADERS, "N° de contrat": "123456" },
    ]);
    const lines = buildStelliumContratsImportPreview(csvRows, [
      sampleInv({ numero_contrat: "0123456", encours_actuel: 1_000_000 }),
    ]);
    expect(lines[0]?.status).toBe("ready");
  });
});

describe("summarizeStelliumImportPreview", () => {
  it("compte les statuts", () => {
    const csvRows = parseStelliumContratsCsvRows([SAMPLE_HEADERS]);
    const lines = buildStelliumContratsImportPreview(csvRows, [sampleInv()]);
    const summary = summarizeStelliumImportPreview(lines);
    expect(summary.total).toBe(1);
    expect(summary.ready + summary.unchanged).toBe(1);
  });
});

describe("sortStelliumImportPreviewLines", () => {
  it("trie par nom de famille puis prénom", () => {
    const csvRows = parseStelliumContratsCsvRows([
      { ...SAMPLE_HEADERS, "N° de contrat": "2", Titulaire: "ZED Bernard" },
      { ...SAMPLE_HEADERS, "N° de contrat": "1", Titulaire: "MARTIN Alice" },
      { ...SAMPLE_HEADERS, "N° de contrat": "3", Titulaire: "MARTIN Paul" },
    ]);
    const invs: StelliumImportInvestissementRef[] = [
      {
        id: 1,
        numero_contrat: "1",
        nom_produit: "A",
        contactNom: "MARTIN",
        contactPrenom: "Alice",
        contactLabel: "Alice MARTIN",
      },
      {
        id: 2,
        numero_contrat: "2",
        nom_produit: "B",
        contactNom: "ZED",
        contactPrenom: "Bernard",
        contactLabel: "Bernard ZED",
      },
      {
        id: 3,
        numero_contrat: "3",
        nom_produit: "C",
        contactNom: "MARTIN",
        contactPrenom: "Paul",
        contactLabel: "Paul MARTIN",
      },
    ];
    const lines = buildStelliumContratsImportPreview(csvRows, invs);
    expect(lines.map((l) => l.numeroContrat)).toEqual(["1", "3", "2"]);
  });
});

describe("famillesNomFromTitulaire", () => {
  it("prend le token majuscules en tête", () => {
    expect(famillesNomFromTitulaire("DUPONT Jean")).toBe("DUPONT");
  });
});

describe("markStelliumLineImported", () => {
  it("passe la ligne en unchanged avec encours mis à jour", () => {
    const csvRows = parseStelliumContratsCsvRows([SAMPLE_HEADERS]);
    const ready = buildStelliumContratsImportPreview(csvRows, [
      sampleInv({ encours_actuel: 1_000_000 }),
    ])[0]!;
    const imported = markStelliumLineImported(ready);
    expect(imported.status).toBe("unchanged");
    expect(imported.crmEncoursCentimes).toBe(ready.valorisationCentimes);
  });
});
