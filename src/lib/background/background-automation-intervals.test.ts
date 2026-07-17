import { describe, expect, it } from "vitest";
import {
  BOX_PLACEMENT_INTERVAL_OPTIONS_MIN,
  MAIL_SCAN_INTERVAL_OPTIONS_MIN,
  RELATION_INTERVAL_OPTIONS_MIN,
  formatMailScanIntervalLabel,
  formatRelationIntervalLabel,
  getBoxPlacementIntervalMs,
  getRelationIntervalMs,
  getStelliumIntervalMs,
  normalizeRelationIntervalMinutes,
  normalizeStelliumIntervalMinutes,
  boxPlacementAutoScanEnabled,
  stelliumAutoScanEnabled,
} from "./background-automation-intervals";
import {
  AUTO_LOCK_OPTIONS_MIN,
  DEFAULT_APP_RUNTIME_PREFS,
  normalizeAppRuntimePrefs,
} from "@/lib/api/tauri-app-runtime";

describe("background-automation-intervals", () => {
  it("propose 3 et 5 min pour la sync relation", () => {
    expect(RELATION_INTERVAL_OPTIONS_MIN).toContain(3);
    expect(RELATION_INTERVAL_OPTIONS_MIN).toContain(5);
    expect(normalizeRelationIntervalMinutes(3)).toBe(3);
    expect(formatRelationIntervalLabel(3)).toBe("3 min");
  });

  it("propose 3–45 min et 1–3 h pour Exceltis et Box Placement", () => {
    expect(MAIL_SCAN_INTERVAL_OPTIONS_MIN).toEqual([0, 3, 5, 15, 30, 45, 60, 120, 180]);
    expect(BOX_PLACEMENT_INTERVAL_OPTIONS_MIN).toEqual(MAIL_SCAN_INTERVAL_OPTIONS_MIN);
    expect(normalizeStelliumIntervalMinutes(60)).toBe(60);
    expect(formatMailScanIntervalLabel(60)).toBe("1 h");
    expect(formatMailScanIntervalLabel(180)).toBe("3 h");
    const prefs = {
      ...DEFAULT_APP_RUNTIME_PREFS,
      stellium_interval_minutes: 5,
      box_placement_interval_minutes: 120,
    };
    expect(getStelliumIntervalMs(prefs)).toBe(5 * 60_000);
    expect(getBoxPlacementIntervalMs(prefs)).toBe(120 * 60_000);
  });

  it("désactive l'auto-scan quand l'intervalle est manuel (0)", () => {
    expect(stelliumAutoScanEnabled({ ...DEFAULT_APP_RUNTIME_PREFS, stellium_interval_minutes: 0 })).toBe(
      false
    );
    expect(
      boxPlacementAutoScanEnabled({ ...DEFAULT_APP_RUNTIME_PREFS, box_placement_interval_minutes: 0 })
    ).toBe(false);
  });

  it("hérite box_placement depuis stellium si absent (prefs legacy)", () => {
    const normalized = normalizeAppRuntimePrefs({
      stellium_interval_minutes: 60,
    });
    expect(normalized.box_placement_interval_minutes).toBe(60);
    expect(normalized.background_box_placement_scan).toBe(true);
  });

  it("normalise le verrouillage automatique sans casser les préférences legacy", () => {
    expect(AUTO_LOCK_OPTIONS_MIN).toEqual([0, 5, 15, 30]);
    expect(normalizeAppRuntimePrefs({}).auto_lock_minutes).toBe(15);
    expect(normalizeAppRuntimePrefs({ auto_lock_minutes: 5 }).auto_lock_minutes).toBe(5);
    expect(normalizeAppRuntimePrefs({ auto_lock_minutes: 99 }).auto_lock_minutes).toBe(15);
  });

  it("calcule getRelationIntervalMs pour 2 h", () => {
    expect(getRelationIntervalMs({ ...DEFAULT_APP_RUNTIME_PREFS, relation_interval_minutes: 120 })).toBe(
      120 * 60_000
    );
  });
});
