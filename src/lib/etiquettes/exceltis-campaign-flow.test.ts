import { describe, expect, it } from "vitest";
import { formatEmailCampaignSummary } from "@/lib/etiquettes/email-campaign-summary";
import { validateEtiquetteForm } from "@/lib/etiquettes/etiquette-form-validation";
import {
  EXCELITIS_EMAIL_TEMPLATE_NOM,
  formatExceltisEtiquetteNom,
  isExceltisEtiquetteNom,
  parseExceltisKeyFromNom,
} from "@/lib/etiquettes/exceltis";
import { suggestTemplateIdForEtiquette } from "@/lib/emails/template-email-meta";

/**
 * Simulation du parcours CGP (logique frontend, sans Tauri) :
 * créer l'étiquette → activer la campagne → mail Stellium (côté Rust) → file Suivi → Envois.
 */
describe("exceltis campaign flow (simulation frontend)", () => {
  const gamme = "Rendement" as const;
  const month = 2;
  const year = 2025;
  const etiquetteNom = formatExceltisEtiquetteNom(gamme, month, year);
  const stelliumSubject = "Remboursement Exceltis Rendement Février 2025";

  const exceltisTemplate = {
    id: 42,
    nom: EXCELITIS_EMAIL_TEMPLATE_NOM,
    categorie: "ARBITRAGE",
    sujet: "Exceltis {{millesime}} — remboursement et prochaines étapes, {{prenom}}",
    corps: "Corps",
    variables: null,
    agenda_link_id: null,
    relance_template_id: null,
    tutoiement_template_id: null,
    created_at: 0,
    updated_at: 0,
  };

  it("1. création — nom canonique et détection Exceltis", () => {
    expect(etiquetteNom).toBe("Exceltis Rendement — Février 2025");
    expect(isExceltisEtiquetteNom(etiquetteNom)).toBe(true);
    expect(parseExceltisKeyFromNom(etiquetteNom)).toEqual({
      gamme: "Rendement",
      month: 2,
      year: 2025,
    });
  });

  it("2. création — modèle email suggéré automatiquement", () => {
    expect(suggestTemplateIdForEtiquette(etiquetteNom, [exceltisTemplate])).toBe(42);
  });

  it("3. activation campagne — sans date ni heure (déclencheur Stellium)", () => {
    expect(
      validateEtiquetteForm({
        nom: etiquetteNom,
        emailActif: true,
        emailTemplateId: 42,
        emailEnvoiMode: "fixed",
        emailEnvoiHeure: "",
        emailEnvoiLocal: "",
        actif: true,
        isAuto: false,
        segmentId: null,
        useGroupRule: false,
        useComboRule: false,
        categoriesSelectionnees: [],
        ruleChildren: [],
        conditionType: "",
        typesProduitSelectionnes: [],
        nomsProduitSelectionnes: [],
        tmiTranchesSelectionnees: [],
        irNetMontant: null,
        revenusAnnuelsMontant: null,
      })
    ).toBeNull();
  });

  it("4. résumé campagne — pas de « date à définir »", () => {
    const summary = formatEmailCampaignSummary({
      active: true,
      template: exceltisTemplate,
      mode: "fixed",
      envoiHeure: "",
      envoiLocal: "",
      emailDelaiJours: 0,
      hasAutoRule: false,
      etiquetteNom,
    });
    expect(summary).toContain("Stellium");
    expect(summary).toContain("aucune date à saisir");
    expect(summary).not.toContain("date à définir");
  });

  it("5. mail Stellium — sujet parseable vers la même clé gamme + millésime", () => {
    const fromSubject = parseExceltisKeyFromNom(stelliumSubject);
    const fromEtiquette = parseExceltisKeyFromNom(etiquetteNom);
    expect(fromSubject).toEqual(fromEtiquette);
  });
});
