import { describe, expect, it } from "vitest";
import { toClientTimeline } from "./espace-timeline";

describe("toClientTimeline", () => {
  it("traduit un événement du moteur sans rien perdre", () => {
    const [event] = toClientTimeline([
      {
        id: "echeance-1",
        kind: "conseiller",
        date: 1_800_000_000,
        label: "Préparez vos justificatifs",
        detail: "Avis d'imposition",
        rdvUrl: "https://calendar.example.com/bilan",
      },
    ]);

    expect(event).toEqual({
      id: "echeance-1",
      kind: "conseiller",
      date: 1_800_000_000,
      label: "Préparez vos justificatifs",
      detail: "Avis d'imposition",
      rdvUrl: "https://calendar.example.com/bilan",
      type_produit: undefined,
      origine: undefined,
    });
  });

  /**
   * Dernier filet si une version du portail transmettait encore des pense-bêtes
   * de travail : ils ne doivent jamais atteindre l'écran du client.
   */
  it("écarte les alertes et les tâches quelle que soit leur provenance", () => {
    const events = toClientTimeline([
      { id: "a-1", kind: "alerte", date: 1, label: "Client injoignable" },
      { id: "t-1", kind: "tache", date: 2, label: "Rappeler le client" },
      { id: "inv-1-fin_pret", kind: "fin_pret", date: 3, label: "Fin de prêt" },
    ]);

    expect(events.map((e) => e.id)).toEqual(["inv-1-fin_pret"]);
  });

  it("accepte les champs absents comme le fait le portail", () => {
    const [event] = toClientTimeline([
      { id: "inv-2-fin_demembrement", kind: "fin_demembrement", date: 4, label: "Fin" },
    ]);

    expect(event.detail).toBeUndefined();
    expect(event.rdvUrl).toBeUndefined();
  });
});
