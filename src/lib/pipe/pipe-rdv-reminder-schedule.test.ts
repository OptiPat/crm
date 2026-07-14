import { describe, expect, it, vi, beforeEach } from "vitest";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";

vi.mock("@/lib/api/tauri-pipe-rdv-email", () => ({
  cancelPipeRdvReminderSchedules: vi.fn(async () => 0),
  replacePipeRdvReminderSchedules: vi.fn(async () => undefined),
}));

vi.mock("@/lib/api/tauri-templates-email", () => ({
  getTemplateEmailById: vi.fn(async () => ({ id: 99 })),
}));

import {
  cancelPipeRdvReminderSchedules,
  replacePipeRdvReminderSchedules,
} from "@/lib/api/tauri-pipe-rdv-email";
import { syncPipeRdvReminderSchedules } from "@/lib/pipe/pipe-rdv-reminder-schedule";

const baseTemplate = (variables: string | null): TemplateEmail => ({
  id: 1,
  nom: "R1",
  sujet: "Sujet",
  corps: "Corps",
  categorie: "AUTRE",
  variables,
  agenda_link_id: null,
  relance_template_id: null,
  tutoiement_template_id: null,
  created_at: 0,
  updated_at: 0,
});

describe("syncPipeRdvReminderSchedules", () => {
  beforeEach(() => {
    vi.mocked(cancelPipeRdvReminderSchedules).mockClear();
    vi.mocked(replacePipeRdvReminderSchedules).mockClear();
  });

  it("annule le kind invalide quand l'autre kind est replacé", async () => {
    const rdvStart = Math.floor(Date.now() / 1000) + 3600;
    const rdvEnd = rdvStart + 3600;
    const variables = JSON.stringify({
      pipe_rdv_reminder: { enabled: true, delai_heures: 24, use_same_message: true },
      pipe_rdv_follow_up: { enabled: true, delai_heures: 24, use_same_message: true },
    });

    await syncPipeRdvReminderSchedules({
      pipeTimelineEntryId: 10,
      pipe: { id: 1, contact_id: 5, secondary_contact_id: null },
      template: baseTemplate(variables),
      startAtUnix: rdvStart,
      endAtUnix: rdvEnd,
    });

    expect(cancelPipeRdvReminderSchedules).toHaveBeenCalledWith(10, "before");
    expect(replacePipeRdvReminderSchedules).toHaveBeenCalledTimes(1);
    const call = vi.mocked(replacePipeRdvReminderSchedules).mock.calls[0]?.[0];
    expect(call?.rows).toHaveLength(1);
    expect(call?.rows[0]?.schedule_kind).toBe("after");
  });

  it("replace les deux kinds quand les deux sendAt sont valides", async () => {
    const rdvStart = Math.floor(Date.now() / 1000) + 7 * 86400;
    const rdvEnd = rdvStart + 3600;
    const variables = JSON.stringify({
      pipe_rdv_reminder: { enabled: true, delai_heures: 24, use_same_message: true },
      pipe_rdv_follow_up: { enabled: true, delai_heures: 24, use_same_message: true },
    });

    await syncPipeRdvReminderSchedules({
      pipeTimelineEntryId: 11,
      pipe: { id: 1, contact_id: 5, secondary_contact_id: null },
      template: baseTemplate(variables),
      startAtUnix: rdvStart,
      endAtUnix: rdvEnd,
    });

    expect(replacePipeRdvReminderSchedules).toHaveBeenCalledTimes(1);
    const rows = vi.mocked(replacePipeRdvReminderSchedules).mock.calls[0]?.[0]?.rows ?? [];
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.schedule_kind).sort()).toEqual(["after", "before"]);
    expect(cancelPipeRdvReminderSchedules).not.toHaveBeenCalled();
  });

  it("annule un kind désactivé sur le modèle", async () => {
    const rdvStart = Math.floor(Date.now() / 1000) + 7 * 86400;
    const rdvEnd = rdvStart + 3600;
    const variables = JSON.stringify({
      pipe_rdv_reminder: { enabled: false },
      pipe_rdv_follow_up: { enabled: true, delai_heures: 24, use_same_message: true },
    });

    await syncPipeRdvReminderSchedules({
      pipeTimelineEntryId: 12,
      pipe: { id: 1, contact_id: 5, secondary_contact_id: null },
      template: baseTemplate(variables),
      startAtUnix: rdvStart,
      endAtUnix: rdvEnd,
    });

    expect(cancelPipeRdvReminderSchedules).toHaveBeenCalledWith(12, "before");
    const rows = vi.mocked(replacePipeRdvReminderSchedules).mock.calls[0]?.[0]?.rows ?? [];
    expect(rows.every((r) => r.schedule_kind === "after")).toBe(true);
  });
});
