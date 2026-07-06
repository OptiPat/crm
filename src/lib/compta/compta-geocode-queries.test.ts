import { describe, expect, it } from "vitest";
import { buildGeocodeQueries } from "@/lib/compta/compta-geocode-queries";

describe("buildGeocodeQueries", () => {
  it("extrait la rue sans le nom du lieu (Grande-Motte)", () => {
    const queries = buildGeocodeQueries(
      "WEST CITY 1, 184 Av. du bois Couchant, 34280 La Grande-Motte, France"
    );
    expect(queries.some((q) => /184.*Avenue du Bois Couchant.*34280/i.test(q))).toBe(true);
  });

  it("extrait la rue Richelieu sans le nom du restaurant", () => {
    const queries = buildGeocodeQueries(
      "Pampa Bar & Brasserie (anciens bains de Montpellier), 6 Rue Richelieu, 34000 Montpellier, France"
    );
    expect(queries.some((q) => /6 Rue Richelieu.*34000/i.test(q))).toBe(true);
  });

  it("propose un repère Coquilloux pour Castelnau-le-Lez", () => {
    const queries = buildGeocodeQueries(
      "Pura Vida - 390 chemin des Coquilloux. Castelnau le Lez"
    );
    expect(queries.some((q) => /Coquilloux.*Castelnau/i.test(q))).toBe(true);
  });

  it("propose Villemarin ou Tarbouriech pour Marseillan", () => {
    const queries = buildGeocodeQueries(
      "Spa Ostrealia Domaine Tarbouriech, Chem. de Villemarin, 34340 Marseillan, France"
    );
    expect(queries.some((q) => /Villemarin.*Marseillan/i.test(q))).toBe(true);
    expect(queries.some((q) => /Tarbouriech.*Marseillan/i.test(q))).toBe(true);
  });

  it("normalise route des 2 ponts en Route des Deux Ponts", () => {
    const queries = buildGeocodeQueries(
      "Slow Village Anduze - Cévennes, 524 route des 2 ponts, 30140 Thoiras-Corbès, France"
    );
    expect(queries.some((q) => /Route des Deux Ponts/i.test(q))).toBe(true);
  });

  it("extrait la rue des Sirènes sans Villa Niwaki", () => {
    const queries = buildGeocodeQueries(
      "Villa Niwaki, 14 Rue des Sirènes, 34470 Pérols, France"
    );
    expect(queries.some((q) => /14 Rue des Sirènes.*34470/i.test(q))).toBe(true);
  });

  it("propose La Grande-Motte pour une ville saisie en minuscules", () => {
    const queries = buildGeocodeQueries("la grande motte");
    expect(queries.some((q) => /La Grande-Motte.*France/i.test(q))).toBe(true);
  });
});
