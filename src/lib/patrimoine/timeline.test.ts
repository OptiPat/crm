import { describe, expect, it } from "vitest";
import { buildPatrimoineTimeline, filterPatrimoineTimelineForClient } from "./timeline";

describe("buildPatrimoineTimeline", () => {
  it("trie les événements par date croissante", () => {
    const events = buildPatrimoineTimeline(
      [
        {
          id: 1,
          type_produit: "SCPI",
          nom_produit: "Corum",
          date_fin_demembrement: 1_800_000_000,
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          created_at: 0,
          updated_at: 0,
        },
        {
          id: 2,
          type_produit: "ASSURANCE_VIE",
          nom_produit: "Contrat A",
          date_prochain_arbitrage: 1_700_000_000,
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          created_at: 0,
          updated_at: 0,
        },
      ],
      [
        {
          id: 10,
          contact_id: 1,
          type_alerte: "SUIVI_CLIENT_ANNUEL",
          message: "Suivi annuel",
          date_alerte: 1_750_000_000,
          lue: false,
          traitee: false,
          created_at: 0,
        },
      ],
      [],
      { includePast: true }
    );

    expect(events.map((e) => e.date)).toEqual([1_750_000_000, 1_800_000_000]);
    expect(events[0].kind).toBe("alerte");
    expect(events[1].kind).toBe("fin_demembrement");
    expect(events[1].type_produit).toBe("SCPI");
    expect(events[1].label).toBe("Fin de démembrement — Corum");
    expect(events[1].detail).toBe("SCPI");
    expect(events.some((e) => e.kind === "prochain_arbitrage")).toBe(false);
  });

  it("ne répète pas le nom produit en détail s'il est déjà dans le titre", () => {
    const events = buildPatrimoineTimeline(
      [
        {
          id: 1,
          type_produit: "RESIDENCE_PRINCIPALE",
          nom_produit: "Résidence Principale",
          date_fin_pret: 1_800_000_000,
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          created_at: 0,
          updated_at: 0,
        },
      ],
      [],
      [],
      { includePast: true }
    );

    expect(events).toHaveLength(1);
    expect(events[0].label).toBe("Fin de prêt — Résidence Principale");
    expect(events[0].detail).toBeUndefined();
  });

  it("filterPatrimoineTimelineForClient retire les arbitrages", () => {
    const filtered = filterPatrimoineTimelineForClient([
      {
        id: "a",
        kind: "prochain_arbitrage",
        date: 1,
        label: "Prochain arbitrage — PER",
      },
      {
        id: "b",
        kind: "fin_pret",
        date: 2,
        label: "Fin de prêt",
      },
    ]);
    expect(filtered).toHaveLength(1);
    expect(filtered[0].kind).toBe("fin_pret");
  });

  it("écarte les échéances passées par défaut", () => {
    const events = buildPatrimoineTimeline(
      [
        {
          id: 1,
          type_produit: "SCPI",
          nom_produit: "Corum",
          date_fin_demembrement: 1_700_000_000,
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          created_at: 0,
          updated_at: 0,
        },
        {
          id: 2,
          type_produit: "SCPI",
          nom_produit: "Primovie",
          date_fin_demembrement: 1_800_000_000,
          versement_programme: false,
          reinvestissement_dividendes: false,
          origine: "MON_CONSEIL",
          created_at: 0,
          updated_at: 0,
        },
      ],
      [],
      [],
      { fromUnix: 1_750_000_000 }
    );

    expect(events.map((e) => e.date)).toEqual([1_800_000_000]);
  });

  it("ignore les alertes traitées", () => {
    const events = buildPatrimoineTimeline(
      [],
      [
        {
          id: 1,
          contact_id: 1,
          type_alerte: "FIN_DEMEMBREMENT",
          message: "Fin SCPI",
          date_alerte: 1_700_000_000,
          lue: true,
          traitee: true,
          created_at: 0,
        },
      ]
    );
    expect(events).toHaveLength(0);
  });
});
