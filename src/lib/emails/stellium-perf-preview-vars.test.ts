import { describe, expect, it } from "vitest";
import {
  alignStelliumVarsForRegistre,
  repairStelliumPerfTemplateText,
  repairStelliumTemplateForRegistre,
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