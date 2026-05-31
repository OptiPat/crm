import { describe, expect, it } from "vitest";
import { getAlerteTraceInfo } from "@/lib/alertes/alerte-trace";
import type { AlerteWithContact } from "@/lib/api/tauri-dashboard";

const base = (type: string): AlerteWithContact => ({
  alerte_id: 1,
  contact_id: 10,
  contact_nom: "Dupont",
  contact_prenom: "Jean",
  contact_categorie: "CLIENT",
  date_dernier_contact: null,
  type_alerte: type,
  message: "Jean Dupont",
  date_alerte: String(Math.floor(Date.now() / 1000) - 10 * 86400),
});

describe("alerte-trace", () => {
  it("explique un client jamais suivi", () => {
    const info = getAlerteTraceInfo(base("CLIENT_JAMAIS_SUIVI"));
    expect(info.rule).toContain("jamais");
    expect(info.source).toContain("automatique");
  });

  it("calcule les jours ouverts", () => {
    const info = getAlerteTraceInfo(base("SUIVI_CLIENT_1AN"));
    expect(info.daysOpen).toBeGreaterThanOrEqual(9);
  });
});
