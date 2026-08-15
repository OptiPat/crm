import { describe, expect, it } from "vitest";
import type { Investissement } from "@/lib/api/tauri-investissements";
import {
  buildInvestmentValorisations,
  buildSynthesePatrimonialePdfModel,
  buildSynthesePdfDownloadFilename,
  buildSynthesePdfClientName,
  fitImageContain,
  SYNTHESE_PDF_LOGO_MAX_H_MM,
  SYNTHESE_PDF_LOGO_MAX_W_MM,
  lastValorisations,
  legalLinesFromCgpConfig,
  legalLinesFromPrivacy,
  legalLinesFromPrivacyAndAdvisor,
  omitRedundantCurrentValorisation,
  formatSyntheseDate,
  formatSyntheseLocalDate,
  pieSlicePath,
  pieSlicePaths,
  SYNTHESE_PDF_SHARE_FILENAME,
  SYNTHESE_PDF_SUBTITLE,
  SYNTHESE_VALO_LIMIT,
} from "./synthese-patrimoniale-pdf";

function inv(partial: Partial<Investissement> & { id: number }): Investissement {
  return {
    nom_produit: "Livret",
    type_produit: "LIVRET_A",
    origine: "EXISTANT_CLIENT",
    versement_programme: false,
    reinvestissement_dividendes: false,
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("synthese-patrimoniale-pdf", () => {
  it("titre et nom de fichier", () => {
    expect(buildSynthesePdfClientName("Jean", "DUPONT")).toBe("Jean DUPONT");
    expect(SYNTHESE_PDF_SUBTITLE).toBe("Synthèse patrimoniale");
    expect(
      buildSynthesePdfDownloadFilename({
        prenom: "Jean",
        nom: "DUPONT",
        dateLabel: "15 août 2026",
      })
    ).toBe("Synthèse patrimoniale - DUPONT Jean - 15 août 2026.pdf");
    expect(
      buildSynthesePdfDownloadFilename({
        prenom: "Jean",
        nom: "DUPONT/MARTIN",
        dateLabel: "15/08/2026",
      })
    ).toBe("Synthèse patrimoniale - DUPONT MARTIN Jean - 15 08 2026.pdf");
    expect(
      buildSynthesePdfDownloadFilename({
        prenom: "",
        nom: "",
        dateLabel: "15 août 2026",
      })
    ).toBe("Synthèse patrimoniale - 15 août 2026.pdf");
    expect(SYNTHESE_PDF_SHARE_FILENAME).toBe("Synthese-patrimoniale.pdf");
    expect(SYNTHESE_PDF_SHARE_FILENAME.toLowerCase()).not.toMatch(/dupont|jean/);
  });

  it("conserve le ratio du logo dans la boîte PDF", () => {
    expect(fitImageContain(100, 100, 28, 14)).toEqual({ width: 14, height: 14 });
    expect(fitImageContain(200, 50, 28, 14)).toEqual({ width: 28, height: 7 });
    expect(fitImageContain(50, 200, 28, 14)).toEqual({ width: 3.5, height: 14 });
    const square = fitImageContain(
      512,
      512,
      SYNTHESE_PDF_LOGO_MAX_W_MM,
      SYNTHESE_PDF_LOGO_MAX_H_MM
    );
    expect(square.width).toBe(square.height);
    expect(square.height).toBe(SYNTHESE_PDF_LOGO_MAX_H_MM);
    expect(square.width).toBeLessThan(SYNTHESE_PDF_LOGO_MAX_W_MM);
  });

  it("garde les 5 valorisations les plus récentes", () => {
    const points = [1, 2, 3, 4, 5, 6].map((n) => ({
      dateTs: n * 86_400,
      montantCentimes: n * 100_00,
    }));
    const last = lastValorisations(points);
    expect(last).toHaveLength(SYNTHESE_VALO_LIMIT);
    expect(last[0]?.dateTs).toBe(6 * 86_400);
    expect(last[4]?.dateTs).toBe(2 * 86_400);
  });

  it("reprend la signature existante, sans inventer de champ", () => {
    expect(
      legalLinesFromCgpConfig({
        email_signature: "Cabinet Exemple\nSIREN 000000000",
        cif_siren: "111",
      })
    ).toEqual(["Cabinet Exemple", "SIREN 000000000"]);
    expect(
      legalLinesFromPrivacy({
        controller: "Cabinet Exemple",
        controllerDetails: "12 rue des Acacias\nSIREN 000000000",
      })
    ).toEqual(["Cabinet Exemple", "12 rue des Acacias", "SIREN 000000000"]);
    expect(
      legalLinesFromPrivacyAndAdvisor(
        {
          controller: "Cabinet Exemple",
          controllerDetails: "SIREN 000000000",
        },
        { prenom: "Jean", nom: "DUPONT", telephone: "0612345678" }
      )
    ).toEqual([
      "Jean DUPONT",
      "0612345678",
      "Cabinet Exemple",
      "SIREN 000000000",
    ]);
  });

  it("ajoute l'identité et le téléphone du profil devant la signature", () => {
    expect(
      legalLinesFromCgpConfig({
        prenom: "Jean",
        nom: "DUPONT",
        telephone: "0612345678",
        email_signature: "SIREN 000000000\nInscrit à l'Orias",
      })
    ).toEqual([
      "Jean DUPONT",
      "0612345678",
      "SIREN 000000000",
      "Inscrit à l'Orias",
    ]);
  });

  it("ne duplique pas l'identité déjà présente dans la signature", () => {
    expect(
      legalLinesFromCgpConfig({
        prenom: "Jean",
        nom: "DUPONT",
        telephone: "06 12 34 56 78",
        email_signature: "Jean DUPONT\n06 12 34 56 78\nSIREN 000000000",
      })
    ).toEqual(["Jean DUPONT", "06 12 34 56 78", "SIREN 000000000"]);
  });

  it("place le téléphone sous le nom si la signature les inverse", () => {
    expect(
      legalLinesFromCgpConfig({
        prenom: "Jean",
        nom: "DUPONT",
        telephone: "0612345678",
        email_signature: "0612345678\nJean DUPONT\nSIREN 000000000",
      })
    ).toEqual(["Jean DUPONT", "0612345678", "SIREN 000000000"]);
  });

  it("construit le document sans liens extranet, avec dates et 5 valos", () => {
    const noon = Math.floor(Date.UTC(2026, 0, 24, 12, 0, 0) / 1000);
    const model = buildSynthesePatrimonialePdfModel({
      prenom: "Jean",
      nom: "DUPONT",
      totalCentimes: 20_000_00,
      categorieData: [
        { name: "Épargne bancaire", value: 20_000_00, color: "#888" },
      ],
      disponibiliteData: [
        { name: "Disponible", value: 20_000_00, color: "#aaa" },
      ],
      investissements: [
        inv({
          id: 1,
          encours_actuel: 20_000_00,
          date_souscription: noon,
          encours_date: noon,
        }),
      ],
      partenaireById: new Map(),
      historiesByInvestissementId: new Map([
        [
          1,
          [1, 2, 3, 4, 5, 6].map((n) => ({
            dateTs: noon - n * 86_400,
            montantCentimes: n * 1_000_00,
            source: "cabinet" as const,
          })),
        ],
      ]),
      legalLines: ["Cabinet Exemple"],
      nowUnix: noon,
    });

    expect(model.clientName).toBe("Jean DUPONT");
    expect(model.subtitle).toBe("Synthèse patrimoniale");
    expect(model.generatedLabel).toMatch(/2026/);
    expect(model.charts).toHaveLength(2);
    expect(JSON.stringify(model)).not.toContain("http");
    const item = model.groups[0]?.items[0];
    expect(item?.originDateLabel).toMatch(/Souscrit le/);
    expect(item?.valorisations).toHaveLength(5);
  });

  it("dessine un disque plein à 100 %", () => {
    const full = pieSlicePath(40, 40, 36, 0, 2 * Math.PI);
    expect(full).toContain("A 36 36");
    expect(pieSlicePaths([{ percent: 100, color: "#000" }])).toHaveLength(1);
  });

  it("ajoute le prix d'achat immobilier avant les valorisations", () => {
    const acquisition = Math.floor(Date.UTC(2019, 3, 2) / 1000);
    const valo = Math.floor(Date.UTC(2026, 7, 11) / 1000);
    const rows = buildInvestmentValorisations(
      { montant_initial: 250_000_00, date_souscription: acquisition },
      [{ dateTs: valo, montantCentimes: 300_000_00 }],
      "Immobilier"
    );
    expect(rows[0]).toMatchObject({
      kind: "achat",
      montantCentimes: 250_000_00,
    });
    expect(rows[0]?.dateLabel).toContain("2019");
    expect(rows[1]).toMatchObject({
      kind: "valorisation",
      montantCentimes: 300_000_00,
    });
  });

  it("étiquette la souscription SCPI et ne duplique pas le même jour", () => {
    const souscrit = Math.floor(Date.UTC(2025, 2, 4) / 1000);
    const rows = buildInvestmentValorisations(
      { montant_initial: 17_800_00, date_souscription: souscrit },
      [{ dateTs: souscrit + 3600, montantCentimes: 17_800_00 }],
      "SCPI"
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("souscription");
    expect(rows[0]?.montantCentimes).toBe(17_800_00);
  });

  it("garde un relevé du jour de souscription s'il a un autre montant", () => {
    const souscrit = Math.floor(Date.UTC(2025, 2, 4, 12, 0, 0) / 1000);
    const rows = buildInvestmentValorisations(
      { montant_initial: 10_000_00, date_souscription: souscrit },
      [{ dateTs: souscrit + 3600, montantCentimes: 10_500_00 }],
      "SCPI"
    );
    expect(rows).toHaveLength(2);
    expect(rows[0]?.montantCentimes).toBe(10_000_00);
    expect(rows[1]?.montantCentimes).toBe(10_500_00);
  });

  it("date d'en-tête suit le calendrier local", () => {
    const lateUtc = Math.floor(Date.UTC(2026, 7, 16, 0, 30, 0) / 1000);
    expect(formatSyntheseDate(lateUtc)).toBe("16 août 2026");
    const local = new Date(lateUtc * 1000);
    const months = [
      "janv.",
      "févr.",
      "mars",
      "avr.",
      "mai",
      "juin",
      "juil.",
      "août",
      "sept.",
      "oct.",
      "nov.",
      "déc.",
    ];
    expect(formatSyntheseLocalDate(lateUtc)).toBe(
      `${local.getDate()} ${months[local.getMonth()]} ${local.getFullYear()}`
    );
  });

  it("garde 5 valorisations en plus du prix d'achat", () => {
    const acquisition = 1_000_000;
    const history = [1, 2, 3, 4, 5, 6].map((n) => ({
      dateTs: acquisition + n * 86_400,
      montantCentimes: n * 1_000_00,
    }));
    const rows = buildInvestmentValorisations(
      { montant_initial: 100_000_00, date_souscription: acquisition },
      history,
      "Immobilier"
    );
    expect(rows[0]?.kind).toBe("achat");
    expect(rows.filter((r) => r.kind === "valorisation")).toHaveLength(5);
  });

  it("retire la valorisation identique au montant affiché", () => {
    const rows = omitRedundantCurrentValorisation(
      [
        {
          dateLabel: "2 avr. 2019",
          montantCentimes: 250_000_00,
          kind: "achat",
        },
        {
          dateLabel: "11 août 2026",
          montantCentimes: 300_000_00,
          kind: "valorisation",
        },
      ],
      300_000_00
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("achat");
  });
});
