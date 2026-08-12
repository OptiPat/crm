import { describe, expect, it } from "vitest";
import { buildValorisationHistories } from "./espace-valorisations";

const JOUR = 86_400;

describe("buildValorisationHistories", () => {
  it("garde les deux sources et les étiquette", () => {
    const histories = buildValorisationHistories([
      {
        investissementId: 7,
        dateTs: 10 * JOUR,
        montantCentimes: 1_100_000,
        source: "cabinet",
      },
      {
        investissementId: 7,
        dateTs: 20 * JOUR,
        montantCentimes: 1_200_000,
        revenuPercuCentimes: 12_000,
        source: "client",
      },
    ]);

    expect(histories.get(7)).toEqual([
      { dateTs: 10 * JOUR, montantCentimes: 1_100_000, revenuPercuCentimes: undefined, source: "cabinet" },
      { dateTs: 20 * JOUR, montantCentimes: 1_200_000, revenuPercuCentimes: 12_000, source: "client" },
    ]);
  });

  /**
   * Sans cette règle, la déclaration du jour apparaîtrait en double dès que le
   * conseiller l'aurait importée puis resynchronisée.
   */
  it("ne montre qu'une ligne par jour, la déclaration en attente primant", () => {
    const histories = buildValorisationHistories(
      [
        {
          investissementId: 7,
          dateTs: 20 * JOUR,
          montantCentimes: 1_200_000,
          source: "client",
        },
      ],
      new Map([[7, [{ dateTs: 20 * JOUR + 3_600, montantCentimes: 1_250_000 }]]])
    );

    const lignes = histories.get(7);
    expect(lignes).toHaveLength(1);
    expect(lignes?.[0].montantCentimes).toBe(1_250_000);
    expect(lignes?.[0].source).toBe("client");
  });

  it("classe par date croissante et sépare les placements", () => {
    const histories = buildValorisationHistories([
      { investissementId: 2, dateTs: 30 * JOUR, montantCentimes: 300, source: "cabinet" },
      { investissementId: 1, dateTs: 30 * JOUR, montantCentimes: 200, source: "cabinet" },
      { investissementId: 1, dateTs: 10 * JOUR, montantCentimes: 100, source: "cabinet" },
    ]);

    expect(histories.get(1)?.map((p) => p.montantCentimes)).toEqual([100, 200]);
    expect(histories.get(2)?.map((p) => p.montantCentimes)).toEqual([300]);
  });

  it("traite une source inconnue comme venant du cabinet", () => {
    const histories = buildValorisationHistories([
      { investissementId: 1, dateTs: JOUR, montantCentimes: 1, source: "futur" },
    ]);

    expect(histories.get(1)?.[0].source).toBe("cabinet");
  });
});
