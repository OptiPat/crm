import type { Foyer } from "@/lib/api/tauri-foyers";
import { describe, expect, it } from "vitest";
import {
  buildDefaultObjectifsClient,
  DEFAULT_OBJECTIFS_CLIENT_TEXT,
} from "@/lib/souscription-cif/build-default-objectifs-client";

function foyer(partial: Partial<Foyer> & Pick<Foyer, "id" | "nom">): Foyer {
  return {
    type_foyer: "COUPLE",
    created_at: 0,
    updated_at: 0,
    ...partial,
  };
}

describe("buildDefaultObjectifsClient", () => {
  it("retourne le texte type si le foyer n'a pas d'objectifs", () => {
    expect(buildDefaultObjectifsClient(null)).toBe(DEFAULT_OBJECTIFS_CLIENT_TEXT);
    expect(buildDefaultObjectifsClient(foyer({ id: 1, nom: "Test" }))).toBe(
      DEFAULT_OBJECTIFS_CLIENT_TEXT
    );
  });

  it("reprend les objectifs patrimoniaux du foyer quand ils sont renseignés", () => {
    expect(
      buildDefaultObjectifsClient(
        foyer({
          id: 1,
          nom: "Test",
          objectifs_patrimoniaux: "Diversifier et transmettre le patrimoine.",
        })
      )
    ).toBe("Diversifier et transmettre le patrimoine.");
  });
});
