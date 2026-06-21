import { describe, expect, it } from "vitest";
import {
  buildStelliumImportPrepareInput,
  isStelliumPerfEmailTemplate,
  stelliumPerfPeriodeLabelFromIso,
} from "./stellium-perf-campaign";
import type { StelliumImportPreviewLine } from "./stellium-contrats-import";

describe("stellium-perf-campaign", () => {
  it("isStelliumPerfEmailTemplate reconnaît les deux modèles", () => {
    expect(isStelliumPerfEmailTemplate("Performance AV/PER Stellium")).toBe(true);
    expect(isStelliumPerfEmailTemplate("Performance AV/PER Stellium (tu)")).toBe(true);
    expect(isStelliumPerfEmailTemplate("Newsletter")).toBe(false);
  });

  it("buildStelliumImportPrepareInput agrège période et ids", () => {
    const line: StelliumImportPreviewLine = {
      lineKey: "1",
      rowIndex: 1,
      numeroContrat: "123",
      titulaire: "DUPONT Jean",
      enveloppe: "AV",
      contratLibelle: "Contrat",
      partenaire: "Stellium",
      valorisationCentimes: 1_000_000,
      versementsNetsCentimes: 900_000,
      rachatsCentimes: 0,
      perfEuroCentimes: 100_000,
      perfPctCalc: 11.11,
      dateValorisationIso: "2026-06-19T00:00:00.000Z",
      status: "ready",
      statusMessage: "ok",
      investissementId: 42,
    };
    const input = buildStelliumImportPrepareInput([line], [42]);
    expect(input).toEqual({
      periode: stelliumPerfPeriodeLabelFromIso("2026-06-19T00:00:00.000Z"),
      releveDateUnix: Math.floor(Date.parse("2026-06-19T00:00:00.000Z") / 1000),
      investissementIds: [42],
    });
  });
});
