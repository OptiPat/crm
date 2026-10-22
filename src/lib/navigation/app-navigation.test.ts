import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  clearPendingNavigationIntents,
  PENDING_NAVIGATION_INTENT_KEYS,
} from "./app-navigation";

const SRC_DIR = join(__dirname, "..", "..");
/** Clés d'intention de navigation : `crm_nav_*`, `crm_open_*`, `crm_*focus_id`. */
const INTENT_KEY_RE = /["'`](crm_nav_[a-z0-9_]+|crm_open_[a-z0-9_]+|crm_[a-z_]*focus_id)["'`]/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
  });
}

describe("clearPendingNavigationIntents", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("liste toutes les clés d'intention écrites dans le code", () => {
    const found = new Set<string>();
    for (const file of sourceFiles(SRC_DIR)) {
      for (const match of readFileSync(file, "utf8").matchAll(INTENT_KEY_RE)) {
        found.add(match[1]);
      }
    }
    expect(found.size).toBeGreaterThan(20);
    const listed = new Set<string>(PENDING_NAVIGATION_INTENT_KEYS);
    expect([...found].filter((key) => !listed.has(key))).toEqual([]);
  });

  it("efface chaque clé listée", () => {
    const store = new Map<string, string>(
      PENDING_NAVIGATION_INTENT_KEYS.map((key) => [key, "1"] as [string, string])
    );
    store.set("crm_suivi_active_tab_v1", "envois");
    vi.stubGlobal("sessionStorage", {
      removeItem: (key: string) => store.delete(key),
    });
    clearPendingNavigationIntents();
    expect([...store.keys()]).toEqual(["crm_suivi_active_tab_v1"]);
  });
});
