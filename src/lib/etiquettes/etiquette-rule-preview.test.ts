import { describe, expect, it } from "vitest";
import { buildEtiquetteRulePreviewJson } from "@/lib/etiquettes/etiquette-rule-preview";

const base = {
  isAuto: true,
  segmentId: null,
  segmentRuleJson: null,
  useComboRule: false,
  ruleOp: "and" as const,
  ruleChildren: [],
  conditionType: "DELAI_SANS_CONTACT",
  categoriesSelectionnees: ["CLIENT"],
  delaiJours: 365,
  inclureSansDate: true,
  ageCible: 69,
  ageJoursAvant: 30,
  champDate: "date_prochain_suivi",
  joursAvant: 30,
  moisDebut: 4,
  moisFin: 5,
  typesProduitSelectionnes: [] as string[],
  invChampDate: "date_fin_demembrement",
  invJoursAvant: 180,
  invTypesProduit: [] as string[],
  tmiTranchesSelectionnees: [] as number[],
  irNetOperator: "gte" as const,
  irNetMontant: "" as number | "",
};

describe("buildEtiquetteRulePreviewJson", () => {
  it("retourne null si pas auto", () => {
    expect(buildEtiquetteRulePreviewJson({ ...base, isAuto: false })).toBeNull();
  });

  it("utilise le JSON du groupe de contacts", () => {
    const json = '{"v":1,"op":"and","children":[]}';
    expect(
      buildEtiquetteRulePreviewJson({
        ...base,
        segmentId: 3,
        segmentRuleJson: json,
      })
    ).toBe(json);
  });

  it("construit un arbre pour délai sans contact", () => {
    const raw = buildEtiquetteRulePreviewJson(base);
    expect(raw).toContain("DELAI_SANS_CONTACT");
    expect(raw).toContain("365");
  });

  it("événement souscription : pas de preview", () => {
    expect(
      buildEtiquetteRulePreviewJson({
        ...base,
        conditionType: "EVENEMENT_SOUSCRIPTION",
      })
    ).toBeNull();
  });
});
