import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  buildRdvCancelledTimelinePayload,
  buildRdvRescheduledTimelinePayload,
  isLastRdvForStage,
  parseRdvTimelineTraceNote,
  phaseHasRdvActivityForStage,
  shouldHighlightRevertToProspection,
  stageHasRdvCancellationTrace,
} from "@/lib/pipe/pipe-rdv-delete";

const mkRdv = (id: number, titre: string): PipeTimelineEntryRecord => ({
  id,
  pipe_id: 1,
  entry_type: "RDV",
  titre,
  contenu: null,
  occurred_at: id * 100,
  created_at: id * 100,
});

describe("pipe-rdv-delete", () => {
  it("détecte le dernier RDV R1", () => {
    const rdv1 = mkRdv(1, "R1");
    const rdv2 = mkRdv(2, "R1");
    expect(isLastRdvForStage(rdv1, [rdv1])).toBe(true);
    expect(isLastRdvForStage(rdv1, [rdv1, rdv2])).toBe(false);
    expect(isLastRdvForStage(rdv2, [rdv1, rdv2])).toBe(false);
  });

  it("propose le retour prospection si dernier RDV et affaire en R1", () => {
    const rdv = mkRdv(1, "R1");
    expect(shouldHighlightRevertToProspection(rdv, [rdv], "R1")).toBe(true);
    expect(shouldHighlightRevertToProspection(rdv, [rdv, mkRdv(2, "R1")], "R1")).toBe(false);
  });

  it("détecte l'absence de RDV dans une phase", () => {
    expect(phaseHasRdvActivityForStage([mkRdv(1, "R1")], "R1")).toBe(true);
    expect(
      phaseHasRdvActivityForStage(
        [{ ...mkRdv(1, "R1"), entry_type: "APPEL", titre: "Appel" }],
        "R1"
      )
    ).toBe(false);
  });

  it("compte une trace de report comme activité RDV de l'étape", () => {
    expect(
      phaseHasRdvActivityForStage(
        [
          {
            ...mkRdv(1, "R1"),
            entry_type: "NOTE",
            titre: null,
            contenu: "RDV R1 reporté : était le 01 janv. 2026, 10:00 → 08 janv. 2026, 10:00",
          },
        ],
        "R1"
      )
    ).toBe(true);
  });

  it("détecte une annulation R1 dans la timeline", () => {
    expect(
      stageHasRdvCancellationTrace(
        [
          {
            ...mkRdv(1, "R1"),
            entry_type: "NOTE",
            contenu: "RDV R1 annulé",
          },
        ],
        "R1"
      )
    ).toBe(true);
  });

  it("trace un report avec note utilisateur", () => {
    const rdv = mkRdv(1, "R1");
    expect(buildRdvRescheduledTimelinePayload(rdv, 100, 200, "Client indisponible")).toEqual({
      titre: null,
      contenu: expect.stringContaining("RDV R1 reporté"),
    });
  });

  it("parse les notes de trace RDV", () => {
    expect(parseRdvTimelineTraceNote("RDV R2 annulé : motif")).toEqual({
      stage: "R2",
      kind: "cancelled",
    });
    expect(parseRdvTimelineTraceNote("RDV R3 reporté : était le x → y")).toEqual({
      stage: "R3",
      kind: "rescheduled",
    });
  });

  it("conserve la note utilisateur seule sans libellé RDV annulé", () => {
    const rdv = mkRdv(1, "R1");
    expect(buildRdvCancelledTimelinePayload(rdv, "Test 2.")).toEqual({
      titre: null,
      contenu: "RDV R1 annulé : Test 2.",
    });
  });

  it("trace l'annulation sans note utilisateur", () => {
    const rdv = mkRdv(1, "R1");
    expect(buildRdvCancelledTimelinePayload(rdv, null)).toEqual({
      titre: null,
      contenu: "RDV R1 annulé",
    });
  });
});
