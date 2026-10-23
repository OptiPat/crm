import { describe, expect, it } from "vitest";
import {
  buildSouscriptionHolderChoices,
  EMPTY_SOUSCRIPTION_EXTRAS,
  formatSouscriptionDetailsSummary,
  placementSouscriptionIsEditable,
  placementSouscriptionNeedsManualPlacement,
  resolveSouscriptionHolderKey,
  souscriptionExtrasFromOperation,
  souscriptionExtrasToPayload,
  souscriptionHolderFieldVisible,
  souscriptionHolderKeyFromOperation,
  souscriptionHolderPayload,
} from "@/lib/placement/souscription-details";

const jean = { id: 1, civilite: "M", prenom: "Jean", nom: "Dupont", foyer_id: 10 };
const marie = { id: 2, civilite: "MME", prenom: "Marie", nom: "Legrand", foyer_id: 10 };

describe("buildSouscriptionHolderChoices", () => {
  it("couple du même foyer : M., Mme, commun (défaut)", () => {
    const choices = buildSouscriptionHolderChoices({
      primary: jean,
      secondary: marie,
      foyer: { id: 10, nom: "Dupont", memberCount: 2 },
    });
    expect(choices.options.map((o) => o.label)).toEqual([
      "M. Jean Dupont",
      "Mme Marie Legrand",
      "Commun (foyer Dupont)",
    ]);
    expect(choices.defaultKey).toBe("foyer:10");
    expect(souscriptionHolderFieldVisible(choices)).toBe(true);
  });

  it("client seul sans foyer : champ masqué, titulaire = client", () => {
    const choices = buildSouscriptionHolderChoices({
      primary: { ...jean, foyer_id: null },
    });
    expect(choices.options).toHaveLength(1);
    expect(choices.defaultKey).toBe("contact:1");
    expect(souscriptionHolderFieldVisible(choices)).toBe(false);
  });

  it("client seul dans son foyer : pas de choix commun", () => {
    const choices = buildSouscriptionHolderChoices({
      primary: jean,
      foyer: { id: 10, nom: "Dupont", memberCount: 1 },
    });
    expect(souscriptionHolderFieldVisible(choices)).toBe(false);
  });

  it("contact avec foyer à plusieurs : choix commun proposé, défaut contact", () => {
    const choices = buildSouscriptionHolderChoices({
      primary: jean,
      foyer: { id: 10, nom: "Dupont", memberCount: 2 },
    });
    expect(choices.options.map((o) => o.key)).toEqual(["contact:1", "foyer:10"]);
    expect(choices.defaultKey).toBe("contact:1");
  });

  it("co-contact hors du foyer : pas de « Commun » même si le foyer compte 2 membres", () => {
    const choices = buildSouscriptionHolderChoices({
      primary: jean,
      secondary: { ...marie, foyer_id: 20 },
      foyer: { id: 10, nom: "Dupont", memberCount: 3 },
    });
    expect(choices.options.map((o) => o.key)).toEqual(["contact:1", "contact:2"]);
    expect(choices.defaultKey).toBe("contact:1");
  });

  it("couple de foyers différents : défaut contact principal", () => {
    const choices = buildSouscriptionHolderChoices({
      primary: { ...jean, foyer_id: null },
      secondary: { ...marie, foyer_id: 20 },
      foyer: { id: 20, nom: "Legrand", memberCount: 1 },
    });
    expect(choices.options.map((o) => o.key)).toEqual(["contact:1", "contact:2"]);
    expect(choices.defaultKey).toBe("contact:1");
  });
});

describe("holder payload", () => {
  it("clé ↔ colonnes exclusives", () => {
    expect(souscriptionHolderPayload("contact:2")).toEqual({
      holder_contact_id: 2,
      holder_foyer_id: null,
    });
    expect(souscriptionHolderPayload("foyer:10")).toEqual({
      holder_contact_id: null,
      holder_foyer_id: 10,
    });
    expect(souscriptionHolderPayload(null)).toEqual({
      holder_contact_id: null,
      holder_foyer_id: null,
    });
    expect(souscriptionHolderKeyFromOperation({ holder_foyer_id: 10 })).toBe("foyer:10");
    expect(souscriptionHolderKeyFromOperation({})).toBeNull();
  });
});

describe("souscriptionExtrasToPayload", () => {
  it("SCPI : VP + réinvestissement", () => {
    const result = souscriptionExtrasToPayload(
      { vpEnabled: true, vpMontantEuros: "200.50", vpFrequence: "MENSUEL", reinvestPct: "50" },
      "SCPI"
    );
    expect(result).toEqual({
      payload: { vp_montant_centimes: 20050, vp_frequence: "MENSUEL", reinvest_dividendes_pct: 50 },
    });
  });

  it("AV : réinvestissement ignoré", () => {
    const result = souscriptionExtrasToPayload(
      { vpEnabled: true, vpMontantEuros: "100", vpFrequence: "ANNUEL", reinvestPct: "100" },
      "ASSURANCE_VIE"
    );
    expect(result).toEqual({
      payload: { vp_montant_centimes: 10000, vp_frequence: "ANNUEL", reinvest_dividendes_pct: null },
    });
  });

  it("erreurs : VP sans montant, % hors bornes", () => {
    expect(
      souscriptionExtrasToPayload({ ...EMPTY_SOUSCRIPTION_EXTRAS, vpEnabled: true }, "PER")
    ).toHaveProperty("error");
    expect(
      souscriptionExtrasToPayload({ ...EMPTY_SOUSCRIPTION_EXTRAS, reinvestPct: "150" }, "SCPI")
    ).toHaveProperty("error");
  });

  it("vide = aucun", () => {
    expect(souscriptionExtrasToPayload(EMPTY_SOUSCRIPTION_EXTRAS, "SCPI")).toEqual({
      payload: { vp_montant_centimes: null, vp_frequence: null, reinvest_dividendes_pct: null },
    });
  });

  it("aller-retour depuis l'opération", () => {
    const value = souscriptionExtrasFromOperation({
      vp_montant_centimes: 15000,
      vp_frequence: "TRIMESTRIEL",
      reinvest_dividendes_pct: 30,
    });
    expect(value).toEqual({
      vpEnabled: true,
      vpMontantEuros: "150",
      vpFrequence: "TRIMESTRIEL",
      reinvestPct: "30",
    });
  });
});

describe("édition et résumé", () => {
  it("modifiable tant que non conforme, uniquement souscription affaire", () => {
    const op = { operation_type: "SOUSCRIPTION", status: "PENDING", dismissed_at: null };
    expect(placementSouscriptionIsEditable(op, "AFFAIRE")).toBe(true);
    expect(placementSouscriptionIsEditable({ ...op, status: "CONFORME" }, "AFFAIRE")).toBe(false);
    expect(placementSouscriptionIsEditable(op, "ACTE_GESTION")).toBe(false);
  });

  it("résumé titulaire / VP / réinvestissement", () => {
    const choices = buildSouscriptionHolderChoices({
      primary: jean,
      secondary: marie,
      foyer: { id: 10, nom: "Dupont", memberCount: 2 },
    });
    const summary = formatSouscriptionDetailsSummary(
      {
        holder_contact_id: 2,
        vp_montant_centimes: 20000,
        vp_frequence: "MENSUEL",
        reinvest_dividendes_pct: 100,
      },
      choices
    );
    expect(summary).toContain("Titulaire : Mme Marie Legrand");
    expect(summary).toContain("Versement programmé 200\u00a0€ mensuel");
    expect(summary).toContain("Réinvestissement 100\u00a0%");
  });
});

describe("placement déjà créé / à créer", () => {
  it("souscription PENDING avec placement lié : non modifiable", () => {
    expect(
      placementSouscriptionIsEditable(
        { operation_type: "SOUSCRIPTION", status: "PENDING", investissement_id: 5 },
        "AFFAIRE"
      )
    ).toBe(false);
  });

  it("conforme sans placement : bouton « Créer le placement »", () => {
    const op = { operation_type: "SOUSCRIPTION", status: "CONFORME", investissement_id: null };
    expect(placementSouscriptionNeedsManualPlacement(op, "AFFAIRE")).toBe(true);
    expect(placementSouscriptionNeedsManualPlacement({ ...op, investissement_id: 3 }, "AFFAIRE")).toBe(
      false
    );
    expect(placementSouscriptionNeedsManualPlacement(op, "ACTE_GESTION")).toBe(false);
  });

  it("titulaire enregistré absent des options : retombe sur le défaut", () => {
    const choices = buildSouscriptionHolderChoices({
      primary: jean,
      secondary: marie,
      foyer: { id: 10, nom: "Dupont", memberCount: 2 },
    });
    expect(resolveSouscriptionHolderKey("contact:99", choices)).toBe("foyer:10");
    expect(resolveSouscriptionHolderKey("contact:2", choices)).toBe("contact:2");
    expect(resolveSouscriptionHolderKey("contact:2", null)).toBe("contact:2");
  });
});
