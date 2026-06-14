import { describe, expect, it } from "vitest";
import {
  buildDefaultRappelDemande,
  DEFAULT_RAPPEL_DEMANDE_TEXT,
} from "@/lib/souscription-cif/build-default-rappel-demande";

describe("buildDefaultRappelDemande", () => {
  it("retourne le texte type", () => {
    expect(buildDefaultRappelDemande()).toBe(DEFAULT_RAPPEL_DEMANDE_TEXT);
  });
});
