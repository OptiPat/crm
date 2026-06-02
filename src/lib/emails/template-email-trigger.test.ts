import { describe, expect, it } from "vitest";
import { stringifyConditionConfig } from "@/lib/api/tauri-etiquettes";
import {
  parseTemplateEmailTrigger,
  setTemplateEmailTriggerInMeta,
} from "@/lib/emails/template-email-trigger";

describe("template-email-trigger", () => {
  it("lit et écrit le déclencheur dans variables", () => {
    const vars = setTemplateEmailTriggerInMeta(null, {
      enabled: true,
      condition_type: "EVENEMENT_SOUSCRIPTION",
      condition_config: stringifyConditionConfig({
        types: ["ASSURANCE_VIE"],
        a_chaque_souscription: true,
      }),
      delai_jours: 1,
      envoi_heure: "09:00",
      categories: ["CLIENT"],
      a_chaque_souscription: true,
    });
    const parsed = parseTemplateEmailTrigger(vars);
    expect(parsed.enabled).toBe(true);
    expect(parsed.condition_type).toBe("EVENEMENT_SOUSCRIPTION");
    expect(parsed.delai_jours).toBe(1);
    const cfg = JSON.parse(parsed.condition_config ?? "{}") as { types: string[] };
    expect(cfg.types).toContain("ASSURANCE_VIE");
  });

  it("migre l'ancien format trigger_type", () => {
    const parsed = parseTemplateEmailTrigger(
      JSON.stringify({
        email_trigger: {
          enabled: true,
          trigger_type: "EVENEMENT_SOUSCRIPTION",
          event_types: ["SCPI"],
          a_chaque_souscription: false,
          delai_jours: 0,
          categories: ["CLIENT"],
        },
      })
    );
    expect(parsed.condition_type).toBe("EVENEMENT_SOUSCRIPTION");
    expect(parsed.a_chaque_souscription).toBe(false);
  });
});
