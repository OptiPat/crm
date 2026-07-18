import { describe, expect, it } from "vitest";
import {
  filterVariablesByQuery,
  getAllEmailVariables,
  getStaticEmailVariables,
  resolveEmailVariablePicker,
  resolveRelevantVariableGroups,
} from "./email-variable-registry";

describe("email-variable-registry", () => {
  it("inclut cabinet dans le registre CGP", () => {
    const keys = getStaticEmailVariables().map((v) => v.key);
    expect(keys).toContain("cabinet");
  });

  it("déduplique periode (SCPI + Stellium)", () => {
    const periode = getStaticEmailVariables().filter((v) => v.key === "periode");
    expect(periode).toHaveLength(1);
  });

  it("filtre une relance sur contact, cgp, agenda et campagne", () => {
    const groups = resolveRelevantVariableGroups({
      categorie: "RELANCE",
      sujet: "Bonjour {{prenom}}",
      corps: "Suite…",
      corpsHtml: "<p>Suite…</p>",
      templateNom: "Relance test",
    });
    expect(groups).toContain("contact");
    expect(groups).toContain("campagne");
    expect(groups).not.toContain("pipe");
    expect(groups).not.toContain("scpi");
  });

  it("affiche pipe pour RENDEZ_VOUS", () => {
    const groups = resolveRelevantVariableGroups({
      categorie: "RENDEZ_VOUS",
      sujet: "RDV",
      corps: "Bonjour",
      corpsHtml: "",
      templateNom: "RDV",
    });
    expect(groups).toContain("pipe");
  });

  it("détecte Stellium par contenu même sans nom officiel", () => {
    const groups = resolveRelevantVariableGroups({
      categorie: "AUTRE",
      sujet: "Perf",
      corps: "{{perf_detail_html}}",
      corpsHtml: "",
      templateNom: "Mon modèle custom",
    });
    expect(groups).toContain("stellium");
  });

  it("place les variables hors contexte dans otherSections", () => {
    const resolved = resolveEmailVariablePicker(
      {
        categorie: "RELANCE",
        sujet: "Bonjour",
        corps: "Corps",
        corpsHtml: "",
        templateNom: "Relance",
      },
      []
    );
    expect(resolved.primarySections.some((s) => s.meta.id === "contact")).toBe(true);
    expect(resolved.hiddenCount).toBeGreaterThan(0);
    expect(resolved.otherSections.some((s) => s.meta.id === "pipe")).toBe(true);
  });

  it("recherche par libellé humain", () => {
    const all = getAllEmailVariables();
    const hits = filterVariablesByQuery(all, "prénom contact");
    expect(hits.some((v) => v.key === "prenom")).toBe(true);
  });

  it("recherche par token technique", () => {
    const all = getAllEmailVariables();
    const hits = filterVariablesByQuery(all, "{{date_rdv}}");
    expect(hits.some((v) => v.key === "date_rdv")).toBe(true);
  });
});
