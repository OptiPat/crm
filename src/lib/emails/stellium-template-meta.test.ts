import { describe, expect, it } from "vitest";
import {
  isStelliumPerfTemplateNom,
  stampStelliumPerfTemplateMeta,
} from "@/lib/emails/stellium-template-meta";

describe("stellium-template-meta", () => {
  it("detecte les noms perf Stellium", () => {
    expect(isStelliumPerfTemplateNom("Performance AV/PER Stellium")).toBe(true);
    expect(isStelliumPerfTemplateNom("Performance AV/PER Stellium (tu)")).toBe(true);
    expect(isStelliumPerfTemplateNom("Bulletin SCPI trimestriel")).toBe(false);
  });

  it("pose le drapeau user_customized sur enregistrement", () => {
    const raw = stampStelliumPerfTemplateMeta(null, "Performance AV/PER Stellium");
    expect(raw).toBeTruthy();
    const parsed = JSON.parse(raw!) as Record<string, unknown>;
    expect(parsed.stellium_perf_template_user_customized).toBe(true);
    expect(parsed.stellium_perf_template_version).toBe(6);
  });
});
