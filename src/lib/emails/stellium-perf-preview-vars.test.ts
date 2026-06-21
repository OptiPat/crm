import { describe, expect, it } from "vitest";
import {
  alignStelliumVarsForRegistre,
  repairStelliumPerfTemplateHtml,
  repairStelliumPerfTemplateText,
  repairStelliumTemplateForRegistre,
  repairStelliumTemplateHtmlForRegistre,
  repairStelliumVousTemplateText,
  stripOrphanStelliumFormalityLines,
} from "./stellium-perf-preview-vars";

describe("repairStelliumPerfTemplateText", () => {
  it("répare {{perf_detail}}_tu avant substitution", () => {
    const raw = "{{perf_intro_tu}}\n\n{{perf_detail}}_tu\n\nBonne journée.";
    expect(repairStelliumPerfTemplateText(raw)).toContain("{{perf_detail_tu}}");
    expect(repairStelliumPerfTemplateText(raw)).not.toContain("}}_tu");
  });

  it("normalise {{perf_detail}} vers tu dans un gabarit tu", () => {
    const raw = "{{perf_intro_tu}}\n\n{{perf_detail}}\n\nBonne journée.";
    expect(repairStelliumTemplateForRegistre(raw, "TU")).toContain("{{perf_detail_tu}}");
  });

  it("ne force pas perf_detail_tu pour un gabarit vous", () => {
    const raw = "{{perf_intro_vous}}\n\n{{perf_detail}}\n\nBonne journée.";
    expect(repairStelliumTemplateForRegistre(raw, "VOUS")).toContain("{{perf_detail}}");
    expect(repairStelliumTemplateForRegistre(raw, "VOUS")).not.toContain("perf_detail_tu");
  });

  it("répare {{perf_detail}}_tu en {{perf_detail}} pour vous", () => {
    const raw = "{{perf_intro_vous}}\n\n{{perf_detail}}_tu\n\nBonne journée.";
    expect(repairStelliumVousTemplateText(raw)).toContain("{{perf_detail}}");
    expect(repairStelliumVousTemplateText(raw)).not.toContain("}}_tu");
  });

  it("retire une ligne _tu orpheline après substitution", () => {
    const rendered =
      "Voici la perf :\n\nValeur actuelle : 100 €\n\n_tu\n\nBonne journée.";
    expect(stripOrphanStelliumFormalityLines(rendered)).not.toContain("_tu");
    expect(stripOrphanStelliumFormalityLines(rendered)).toContain("Bonne journée.");
  });
});

describe("repairStelliumPerfTemplateHtml", () => {
  it("mappe {{perf_detail}}_tu vers perf_detail_html_tu (pas perf_detail_tu)", () => {
    const raw = "<div>{{perf_intro_tu}}</div><div>{{perf_detail}}_tu</div>";
    expect(repairStelliumTemplateHtmlForRegistre(raw, "TU")).toContain(
      "{{perf_detail_html_tu}}"
    );
    expect(repairStelliumTemplateHtmlForRegistre(raw, "TU")).not.toContain(
      "{{perf_detail_tu}}"
    );
    expect(repairStelliumTemplateHtmlForRegistre(raw, "TU")).not.toContain("}}_tu");
  });

  it("laisse un gabarit HTML tu déjà propre inchangé", () => {
    const clean =
      '<div>{{perf_intro_tu}}</div><div>{{perf_detail_html_tu}}</div>';
    expect(repairStelliumPerfTemplateHtml(clean)).toBe(clean);
  });
});

describe("alignStelliumVarsForRegistre", () => {
  it("mappe perf_detail vers perf_detail_tu pour un contact TU", () => {
    const aligned = alignStelliumVarsForRegistre(
      {
        perf_detail: "Ce que vous avez versé",
        perf_detail_tu: "Ce que tu as versé",
      },
      "TU"
    );
    expect(aligned.perf_detail).toBe("Ce que tu as versé");
  });
});