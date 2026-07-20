import { describe, expect, it } from "vitest";
import {
  DOM_BUBBLE_MIN_HIT_RADIUS,
  FRANCE_DOM_DEPT_CODES,
  getDomEncartMapPoint,
  HEAT_MAP_EMPTY_COLOR,
  heatColorForCount,
  heatLegendPresenceColors,
} from "./france-departement-map-layout";

describe("heatColorForCount", () => {
  it("garde le bleu pâle pour zéro contact", () => {
    expect(heatColorForCount(0, 10)).toBe(HEAT_MAP_EMPTY_COLOR);
  });

  it("utilise une autre couleur dès qu'il y a de la présence", () => {
    const withPresence = heatColorForCount(1, 10);
    expect(withPresence).not.toBe(HEAT_MAP_EMPTY_COLOR);
    expect(withPresence).toMatch(/^rgb\(/);
  });

  it("intensifie la couleur avec le volume", () => {
    const low = heatColorForCount(1, 100);
    const high = heatColorForCount(100, 100);
    expect(low).not.toBe(high);
  });

  it("expose des repères pour la légende", () => {
    const legend = heatLegendPresenceColors(20);
    expect(legend.low).not.toBe(HEAT_MAP_EMPTY_COLOR);
    expect(legend.high).not.toBe(legend.low);
  });
});

describe("getDomEncartMapPoint", () => {
  it("positionne chaque DOM sans chevauchement géographique 971/972", () => {
    const p971 = getDomEncartMapPoint("971");
    const p972 = getDomEncartMapPoint("972");
    expect(p971).toBeDefined();
    expect(p972).toBeDefined();
    const dx = Math.abs(p971!.x - p972!.x);
    const dy = Math.abs(p971!.y - p972!.y);
    expect(Math.hypot(dx, dy)).toBeGreaterThanOrEqual(DOM_BUBBLE_MIN_HIT_RADIUS * 2);
  });

  it("couvre tous les codes DOM de l'encart", () => {
    for (const code of FRANCE_DOM_DEPT_CODES) {
      expect(getDomEncartMapPoint(code)).toBeDefined();
    }
  });

  it("inclut les territoires 975, 977, 978 et 986", () => {
    expect(FRANCE_DOM_DEPT_CODES).toEqual(
      expect.arrayContaining(["975", "977", "978", "986"])
    );
  });
});
