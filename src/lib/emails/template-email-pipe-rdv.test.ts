import { describe, expect, it } from "vitest";
import {
  computePipeRdvFollowUpSendAt,
  computePipeRdvReminderSendAt,
  formatPipeRdvFollowUpScheduleSummary,
  formatPipeRdvReminderScheduleSummary,
  findPipeRdvTemplatesForStage,
  parseTemplateEmailPipeRdvTrigger,
  pipeRdvTriggerBadgeLabel,
} from "./template-email-pipe-rdv";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";

const baseTemplate = (id: number, variables: string | null): TemplateEmail => ({
  id,
  nom: `T${id}`,
  sujet: "",
  corps: "",
  categorie: "AUTRE",
  variables,
  agenda_link_id: null,
  relance_template_id: null,
  tutoiement_template_id: null,
  created_at: 0,
  updated_at: 0,
});

describe("template-email-pipe-rdv", () => {
  it("computePipeRdvReminderSendAt soustrait delai_heures", () => {
    const rdv = Math.floor(Date.now() / 1000) + 7 * 86400;
    expect(computePipeRdvReminderSendAt(rdv, { delai_heures: 24, envoi_heure: null })).toBe(
      rdv - 86400
    );
  });

  it("computePipeRdvReminderSendAt retourne null si trop tard", () => {
    const rdv = Math.floor(Date.now() / 1000) + 3600;
    expect(computePipeRdvReminderSendAt(rdv, { delai_heures: 24, envoi_heure: null })).toBeNull();
  });

  it("formatPipeRdvReminderScheduleSummary", () => {
    expect(formatPipeRdvReminderScheduleSummary({ delai_heures: 24, envoi_heure: null })).toBe(
      "1 j avant le RDV"
    );
    expect(formatPipeRdvReminderScheduleSummary({ delai_heures: 24, envoi_heure: "09:00" })).toBe(
      "1 j avant le RDV, vers 09:00"
    );
  });

  it("findPipeRdvTemplatesForStage", () => {
    const vars = JSON.stringify({
      pipe_rdv_trigger: { enabled: true, stages: ["R1", "R2"] },
    });
    const templates = [
      baseTemplate(1, vars),
      baseTemplate(2, null),
      baseTemplate(3, JSON.stringify({ pipe_rdv_trigger: { enabled: true, stages: ["R3"] } })),
    ];
    expect(findPipeRdvTemplatesForStage(templates, "R1")).toHaveLength(1);
    expect(findPipeRdvTemplatesForStage(templates, "R3")).toHaveLength(1);
    expect(findPipeRdvTemplatesForStage(templates, "R2")[0]?.id).toBe(1);
  });

  it("parseTemplateEmailPipeRdvTrigger", () => {
    const cfg = parseTemplateEmailPipeRdvTrigger(
      JSON.stringify({ pipe_rdv_trigger: { enabled: true, stages: ["R1"] } })
    );
    expect(cfg.enabled).toBe(true);
    expect(cfg.stages).toEqual(["R1"]);
  });

  it("computePipeRdvFollowUpSendAt ajoute delai_heures après la fin du RDV", () => {
    const rdvEnd = Math.floor(Date.now() / 1000) + 7 * 86400;
    expect(computePipeRdvFollowUpSendAt(rdvEnd, { delai_heures: 24, envoi_heure: null })).toBe(
      rdvEnd + 86400
    );
  });

  it("formatPipeRdvFollowUpScheduleSummary", () => {
    expect(formatPipeRdvFollowUpScheduleSummary({ delai_heures: 48, envoi_heure: null })).toBe(
      "2 j après le RDV"
    );
  });

  it("pipeRdvTriggerBadgeLabel avec rappel et suivi", () => {
    expect(
      pipeRdvTriggerBadgeLabel(
        JSON.stringify({
          pipe_rdv_trigger: { enabled: true, stages: ["R1"] },
          pipe_rdv_reminder: { enabled: true, delai_heures: 24 },
          pipe_rdv_follow_up: { enabled: true, delai_heures: 24 },
        })
      )
    ).toBe("Pipe RDV R1 + rappel + suivi");
  });

  it("pipeRdvTriggerBadgeLabel", () => {
    expect(pipeRdvTriggerBadgeLabel(null)).toBeNull();
    expect(
      pipeRdvTriggerBadgeLabel(
        JSON.stringify({
          pipe_rdv_trigger: { enabled: true, stages: ["R1"] },
          pipe_rdv_reminder: { enabled: true, delai_heures: 24 },
        })
      )
    ).toBe("Pipe RDV R1 + rappel");
    expect(
      pipeRdvTriggerBadgeLabel(
        JSON.stringify({ pipe_rdv_trigger: { enabled: true, stages: ["R2", "R3"] } })
      )
    ).toBe("Pipe RDV R2, R3");
  });

  it("resolvePipeRdvTemplateForStage ignore legacy si trigger actif ailleurs", async () => {
    const { resolvePipeRdvTemplateForStage } = await import("./template-email-pipe-rdv");
    const templates = [
      baseTemplate(
        1,
        JSON.stringify({ pipe_rdv_trigger: { enabled: true, stages: ["R1"] } })
      ),
    ];
    const r2 = await resolvePipeRdvTemplateForStage("R2", templates);
    expect(r2).toBeNull();
  });
});
