import { describe, expect, it } from "vitest";
import {
  mapStelliumLabelToOperationType,
  parseBoxPlacementEmail,
  parseBoxPlacementOperationLine,
} from "./box-placement-email";

const CONFORME_BODY = `Bonjour,

Nous vous confirmons de l'envoi au partenaire ce-jour de l'opération suivante :

Arbitrage libre - Cristalliance Evoluvie - DUPONT Jean

Bien cordialement,
L'équipe Stellium`;

const CONFORME_SUBJECT =
  "Box placement - Envoi dossier d'opération - DUPONT Jean";

const NON_CONFORME_BODY = `Bonjour,

Nous vous signalons une non-conformité pour l'opération suivante :

Versements programmés : Mise en place - Cristalliance Evoluvie - LEGRAND Paul

Bien cordialement,
L'équipe Stellium`;

const NON_CONFORME_SUBJECT =
  "Box placement - Non-conformité à traiter - LEGRAND Paul";

describe("parseBoxPlacementOperationLine", () => {
  it("découpe type, produit et client", () => {
    const parsed = parseBoxPlacementOperationLine(
      "Réinvestissements des dividendes : Mise en place - Epargne Pierre Europe ALPSI - BERNARD Luc"
    );
    expect(parsed).toEqual({
      stelliumLabel: "Réinvestissements des dividendes : Mise en place",
      productLabel: "Epargne Pierre Europe ALPSI",
      contactFull: "BERNARD Luc",
    });
  });
});

describe("mapStelliumLabelToOperationType", () => {
  it("mappe les libellés Stellium", () => {
    expect(mapStelliumLabelToOperationType("Arbitrage libre")).toBe("ARBITRAGE");
    expect(mapStelliumLabelToOperationType("Versements programmés : Mise en place")).toBe(
      "VERSEMENT"
    );
    expect(
      mapStelliumLabelToOperationType("Réinvestissements des dividendes : Mise en place")
    ).toBe("REINVESTISSEMENT");
  });
});

describe("parseBoxPlacementEmail", () => {
  it("parse un mail conforme", () => {
    const parsed = parseBoxPlacementEmail(CONFORME_SUBJECT, CONFORME_BODY);
    expect(parsed).toEqual({
      kind: "CONFORME",
      contactNom: "DUPONT",
      contactPrenom: "Jean",
      stelliumLabel: "Arbitrage libre",
      productLabel: "Cristalliance Evoluvie",
      operationLine: "Arbitrage libre - Cristalliance Evoluvie - DUPONT Jean",
    });
    expect(mapStelliumLabelToOperationType(parsed!.stelliumLabel)).toBe("ARBITRAGE");
  });

  it("parse un mail non conforme", () => {
    const parsed = parseBoxPlacementEmail(NON_CONFORME_SUBJECT, NON_CONFORME_BODY);
    expect(parsed).toMatchObject({
      kind: "NON_CONFORME",
      contactNom: "LEGRAND",
      contactPrenom: "Paul",
      stelliumLabel: "Versements programmés : Mise en place",
      productLabel: "Cristalliance Evoluvie",
    });
  });
});
