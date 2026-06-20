import { describe, expect, it } from "vitest";
import {
  formatEtiquetteAutoBadgeLabel,
  formatEtiquetteRuleHint,
  formatRuleTreeBrief,
  type SegmentLookup,
} from "@/lib/etiquettes/etiquette-card-summary";

describe("etiquette-card-summary", () => {
  const segments: SegmentLookup = new Map([
    [
      7,
      {
        nom: "Clients inactifs",
        rule_json: JSON.stringify({
          v: 1,
          op: "and",
          children: [
            { type: "DELAI_SANS_CONTACT", config: { jours: 365 }, categories: ["CLIENT"] },
          ],
        }),
      },
    ],
  ]);

  it("affiche le nom du groupe sur le badge", () => {
    expect(
      formatEtiquetteAutoBadgeLabel({ segment_id: 7, auto_condition_type: null }, segments)
    ).toBe("Groupe · Clients inactifs");
  });

  it("résume une étiquette liée à un groupe de contacts", () => {
    const hint = formatEtiquetteRuleHint(
      {
        segment_id: 7,
        auto_condition_type: null,
        auto_condition_config: null,
        auto_categories: null,
      },
      segments
    );
    expect(hint).toContain("Clients inactifs");
    expect(hint).toContain("Délai sans contact");
  });

  it("résume une RULE_TREE multi-conditions", () => {
    const rule = JSON.stringify({
      v: 1,
      op: "or",
      children: [
        { type: "DELAI_SANS_CONTACT", config: {}, categories: ["CLIENT"] },
        { type: "JAMAIS_CONTACT", config: {}, categories: ["CLIENT"] },
      ],
    });
    expect(formatRuleTreeBrief(rule)).toBe("2 conditions (OU)");
    expect(
      formatEtiquetteAutoBadgeLabel(
        { segment_id: null, auto_condition_type: "RULE_TREE" },
        segments
      )
    ).toBe("Règle combinée");
  });
});
