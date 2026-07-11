import { describe, expect, it } from "vitest";
import type { PipeTimelineEntryRecord } from "@/lib/api/tauri-pipe-timeline";
import {
  getProspectionCreationMilestone,
  getProspectionPhaseUserEntries,
} from "@/lib/pipe/pipe-prospection-phase";
import type { PipeTimelineDisplayContext } from "@/lib/pipe/pipe-timeline-display";

describe("getProspectionPhaseUserEntries", () => {
  const context: PipeTimelineDisplayContext = { pipeType: "AFFAIRE" };

  const creation: PipeTimelineEntryRecord = {
    id: 1,
    pipe_id: 10,
    entry_type: "CREATION",
    titre: "Affaire",
    contenu: "Contexte",
    occurred_at: 1000,
    created_at: 1000,
  };

  const r1: PipeTimelineEntryRecord = {
    id: 2,
    pipe_id: 10,
    entry_type: "AVANCEMENT",
    titre: "R1",
    contenu: null,
    occurred_at: 5000,
    created_at: 5000,
  };

  const appel: PipeTimelineEntryRecord = {
    id: 3,
    pipe_id: 10,
    entry_type: "APPEL",
    titre: "Premier appel",
    contenu: "Message laissé",
    occurred_at: 2000,
    created_at: 2000,
  };

  const rdv: PipeTimelineEntryRecord = {
    id: 4,
    pipe_id: 10,
    entry_type: "RDV",
    titre: "RDV découverte",
    contenu: null,
    occurred_at: 3000,
    created_at: 3000,
  };

  const afterR1: PipeTimelineEntryRecord = {
    id: 5,
    pipe_id: 10,
    entry_type: "APPEL",
    titre: "Relance R1",
    contenu: null,
    occurred_at: 6000,
    created_at: 6000,
  };

  it("retourne appels et RDV entre création et premier avancement", () => {
    const entries = [creation, r1, appel, rdv, afterR1];
    expect(getProspectionPhaseUserEntries(entries, context)).toEqual([appel, rdv]);
  });

  it("inclut les entrées après création si pas encore d'avancement", () => {
    const entries = [creation, appel, rdv];
    expect(getProspectionPhaseUserEntries(entries, context)).toEqual([appel, rdv]);
  });

  it("retourne vide pour pipe non affaire", () => {
    expect(
      getProspectionPhaseUserEntries([creation, appel], { pipeType: "ACTION" })
    ).toEqual([]);
  });

  it("identifie le jalon prospection", () => {
    expect(getProspectionCreationMilestone([creation, r1], context)).toEqual(creation);
  });
});
