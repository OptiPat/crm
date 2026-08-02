import { describe, expect, it } from "vitest";
import { suiviPipeTitreFromFicheConseilTask } from "@/lib/placement/create-suivi-from-fiche-conseil-task";

describe("suiviPipeTitreFromFicheConseilTask", () => {
  it("utilise le titre de la tâche", () => {
    expect(
      suiviPipeTitreFromFicheConseilTask({
        titre: "Arbitrage assurance vie — DUPONT Jean",
      })
    ).toBe("Arbitrage assurance vie — DUPONT Jean");
  });

  it("retombe sur le titre suivi mensuel si la tâche est vide", () => {
    const month = new Date().toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
    expect(
      suiviPipeTitreFromFicheConseilTask(
        { titre: "   " },
        { prenom: "Jean", nom: "Dupont" }
      )
    ).toBe(`Jean Dupont — suivi ${month}`);
  });
});
