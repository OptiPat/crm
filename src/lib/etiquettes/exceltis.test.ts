import { describe, expect, it } from "vitest";
import {
  buildExceltisFormProposals,
  buildNewExceltisEtiquettePayload,
  adaptExceltisTacheTitreForClone,
  exceltisEtiquetteKeysMatch,
  findLatestExceltisEtiquetteForClone,
  formatExceltisEtiquetteNom,
  getExceltisMillesimeProposals,
  inferExceltisFormChoice,
  isExceltisEligibleProductType,
  isExceltisEtiquetteNom,
  parseExceltisGammeFromText,
  parseExceltisKeyFromNom,
  parseMillesimeLabelFromEtiquetteNom,
  contactHasExceltisAssignment,
  catalogueHasExceltisEtiquette,
  contactHasGammeForProposal,
  findCatalogueMatchForGamme,
  findExceltisEtiquetteInList,
  resolveCreatableExceltisMillesime,
} from "./exceltis";
import type { Etiquette } from "@/lib/api/tauri-etiquettes";

describe("exceltis", () => {
  it("propose M+1 à M+3 depuis mai 2026", () => {
    const ref = new Date(2026, 4, 15);
    const options = getExceltisMillesimeProposals(ref);
    expect(options).toHaveLength(3);
    expect(options[0]).toMatchObject({ label: "Juin 2026", offset: 1, key: "2026-06" });
    expect(options[1]).toMatchObject({ label: "Juillet 2026", offset: 2, key: "2026-07" });
    expect(options[2]).toMatchObject({ label: "Août 2026", offset: 3, key: "2026-08" });
  });

  it("formate le nom d'étiquette avec gamme", () => {
    expect(formatExceltisEtiquetteNom("Rendement", 8, 2026)).toBe("Exceltis Rendement — Août 2026");
    expect(formatExceltisEtiquetteNom("Patrimoine", 6, 2026)).toBe("Exceltis Patrimoine — Juin 2026");
  });

  it("identifie les types de produit éligibles Exceltis", () => {
    expect(isExceltisEligibleProductType("ASSURANCE_VIE")).toBe(true);
    expect(isExceltisEligibleProductType("PER")).toBe(true);
    expect(isExceltisEligibleProductType("SCPI")).toBe(false);
  });

  it("extrait gamme et millésime depuis le nom d'étiquette", () => {
    expect(parseMillesimeLabelFromEtiquetteNom("Exceltis Rendement — Février 2025")).toBe(
      "Février 2025"
    );
    expect(parseExceltisKeyFromNom("Exceltis Rendement — Octobre 2024")).toEqual({
      gamme: "Rendement",
      month: 10,
      year: 2024,
    });
    expect(parseMillesimeLabelFromEtiquetteNom("Suivi > 1 an")).toBeNull();
    expect(isExceltisEtiquetteNom("Exceltis Sérénité — Mai 2024")).toBe(true);
  });

  it("accepte les variantes de nom (tiret, casse, accents)", () => {
    expect(parseExceltisKeyFromNom("Exceltis Rendement - Août 2026")).toEqual({
      gamme: "Rendement",
      month: 8,
      year: 2026,
    });
    expect(parseExceltisKeyFromNom("exceltis patrimoine aout 2026")).toEqual({
      gamme: "Patrimoine",
      month: 8,
      year: 2026,
    });
    expect(isExceltisEtiquetteNom("Exceltis — remboursement et arbitrage")).toBe(false);
  });

  it("mappe Patrimoine Taux (Stellium) vers Patrimoine", () => {
    expect(parseExceltisGammeFromText("Exceltis Patrimoine Taux Juin 2026")).toBe("Patrimoine");
    expect(parseExceltisGammeFromText("Remboursement Exceltis Rendement Février 2025")).toBe(
      "Rendement"
    );
  });

  it("matche par gamme + millésime", () => {
    const rendement = { gamme: "Rendement" as const, month: 8, year: 2026 };
    const patrimoine = { gamme: "Patrimoine" as const, month: 8, year: 2026 };
    expect(exceltisEtiquetteKeysMatch(rendement, rendement)).toBe(true);
    expect(exceltisEtiquetteKeysMatch(rendement, patrimoine)).toBe(false);
  });

  it("conserve le legacy sans gamme", () => {
    const legacy = { month: 8, year: 2026 };
    expect(exceltisEtiquetteKeysMatch(legacy, legacy)).toBe(true);
    expect(isExceltisEtiquetteNom("Exceltis — Août 2026")).toBe(true);
  });

  it("enrichit les propositions avec le catalogue et le contact", () => {
    const ref = new Date(2026, 6, 1);
    const etiquettes = [
      {
        id: 1,
        nom: "Exceltis Rendement — Août 2026",
      } as Etiquette,
    ];
    const contactEtiquettes = [
      { etiquette_nom: "Exceltis Rendement — Août 2026" },
    ];
    const proposals = buildExceltisFormProposals(etiquettes, contactEtiquettes, ref);
    const aout = proposals.find((p) => p.key === "2026-08");
    expect(aout?.catalogueMatches).toHaveLength(1);
    expect(aout?.contactGammes.Rendement).toBe(true);
    expect(inferExceltisFormChoice(proposals)).toEqual({
      hasExceltis: true,
      gamme: "Rendement",
      millesimeKey: "2026-08",
    });
  });

  it("signale catalogue sans pose contact", () => {
    const ref = new Date(2026, 6, 1);
    const proposals = buildExceltisFormProposals(
      [{ id: 2, nom: "Exceltis Patrimoine — Septembre 2026" } as Etiquette],
      [],
      ref
    );
    expect(inferExceltisFormChoice(proposals)).toEqual({ hasExceltis: false });
    expect(catalogueHasExceltisEtiquette(proposals, "Patrimoine", "2026-09")).toBe(true);
    expect(catalogueHasExceltisEtiquette(proposals, "Sérénité", "2026-09")).toBe(false);
    expect(
      contactHasExceltisAssignment([], "Patrimoine", { month: 9, year: 2026 })
    ).toBe(false);
  });

  it("filtre catalogue et contact par gamme", () => {
    const ref = new Date(2026, 6, 1);
    const proposals = buildExceltisFormProposals(
      [
        { id: 1, nom: "Exceltis Rendement — Août 2026" } as Etiquette,
        { id: 2, nom: "Exceltis Sérénité — Septembre 2026" } as Etiquette,
      ],
      [{ etiquette_nom: "Exceltis Rendement — Août 2026" }],
      ref
    );
    const aout = proposals.find((p) => p.key === "2026-08")!;
    const sept = proposals.find((p) => p.key === "2026-09")!;
    expect(findCatalogueMatchForGamme(aout, "Rendement")?.nom).toContain("Rendement");
    expect(findCatalogueMatchForGamme(aout, "Sérénité")).toBeUndefined();
    expect(findCatalogueMatchForGamme(sept, "Sérénité")?.nom).toContain("Sérénité");
    expect(contactHasGammeForProposal(aout, "Rendement")).toBe(true);
    expect(contactHasGammeForProposal(aout, "Sérénité")).toBe(false);
  });

  it("choisit la dernière étiquette Exceltis à cloner (gamme prioritaire)", () => {
    const base = {
      couleur: "#EAB308",
      icone: null,
      description: null,
      priorite: 50,
      auto_condition_type: null,
      auto_condition_config: null,
      auto_categories: null,
      email_template_id: 42,
      email_delai_jours: 0,
      email_envoi_prevu: null,
      email_envoi_heure: "10:00",
      email_envoi_jours_semaine: "MARDI_JEUDI",
      email_actif: true,
      is_default: false,
      actif: true,
      segment_id: null,
      pipeline_actif: true,
      rendement_cible: "9 %/an",
      updated_at: 0,
    } satisfies Omit<Etiquette, "id" | "nom" | "created_at">;

    const etiquettes: Etiquette[] = [
      {
        ...base,
        id: 1,
        nom: "Exceltis Rendement — Juin 2026",
        created_at: 100,
      },
      {
        ...base,
        id: 2,
        nom: "Exceltis Sérénité — Août 2026",
        created_at: 200,
      },
      {
        ...base,
        id: 3,
        nom: "Exceltis Rendement — Août 2026",
        created_at: 150,
      },
    ];

    expect(findLatestExceltisEtiquetteForClone(etiquettes, "Rendement")?.nom).toBe(
      "Exceltis Rendement — Août 2026"
    );
    expect(findLatestExceltisEtiquetteForClone(etiquettes, "Sérénité")?.nom).toBe(
      "Exceltis Sérénité — Août 2026"
    );
  });

  it("reprend le paramétrage campagne depuis le modèle", () => {
    const template = {
      id: 9,
      nom: "Exceltis Patrimoine — Juillet 2026",
      couleur: "#F59E0B",
      icone: null,
      description: "Desc",
      priorite: 60,
      auto_condition_type: null,
      auto_condition_config: null,
      auto_categories: null,
      email_template_id: 77,
      email_delai_jours: 2,
      email_envoi_prevu: null,
      email_envoi_heure: "09:30",
      email_envoi_jours_semaine: "MARDI_JEUDI",
      email_actif: true,
      is_default: false,
      actif: true,
      segment_id: null,
      pipeline_actif: true,
      rendement_cible: "8 %/an",
      created_at: 1,
      updated_at: 1,
    } satisfies Etiquette;

    const payload = buildNewExceltisEtiquettePayload(
      "Exceltis Patrimoine — Octobre 2026",
      template,
      42
    );

    expect(payload.email_template_id).toBe(77);
    expect(payload.email_envoi_heure).toBe("09:30");
    expect(payload.rendement_cible).toBe("8 %/an");
    expect(payload.email_actif).toBe(true);
    expect(payload.couleur).toBe("#F59E0B");
  });

  it("adapte le titre de tâche cloné au nouveau millésime", () => {
    const template = {
      id: 9,
      nom: "Exceltis Rendement — Septembre 2026",
    } as Etiquette;
    expect(
      adaptExceltisTacheTitreForClone(
        "Arbitrage Exceltis Rendement Septembre 2026",
        template,
        "Exceltis Rendement — Octobre 2026",
        "Rendement",
        10,
        2026
      )
    ).toBe("Arbitrage Exceltis Rendement Octobre 2026");
  });

  it("propose le premier millésime créable pour une gamme", () => {
    const ref = new Date(2026, 6, 1);
    const etiquettes = [
      { id: 1, nom: "Exceltis Rendement — Août 2026" } as Etiquette,
      { id: 2, nom: "Exceltis Rendement — Septembre 2026" } as Etiquette,
    ];
    const next = resolveCreatableExceltisMillesime("Rendement", etiquettes, ref);
    expect(next?.key).toBe("2026-10");
    expect(
      findExceltisEtiquetteInList("Rendement", 8, 2026, etiquettes)?.nom
    ).toContain("Août 2026");
  });
});
