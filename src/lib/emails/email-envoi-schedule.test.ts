import { describe, expect, it } from "vitest";
import {
  emailEnvoiJoursSemaineLabel,
  parseEmailEnvoiJoursSemaine,
  serializeEmailEnvoiJoursSemaine,
  toggleEmailEnvoiJour,
} from "@/lib/emails/email-envoi-schedule";

describe("email-envoi-schedule", () => {
  it("legacy MARDI_JEUDI", () => {
    expect(parseEmailEnvoiJoursSemaine("MARDI_JEUDI")).toEqual(["MAR", "JEU"]);
  });

  it("JSON jours libres", () => {
    expect(parseEmailEnvoiJoursSemaine('["MER","MAR"]')).toEqual(["MAR", "MER"]);
    expect(serializeEmailEnvoiJoursSemaine(["MER"])).toBe('["MER"]');
  });

  it("calendaire", () => {
    expect(parseEmailEnvoiJoursSemaine(null)).toBeNull();
    expect(serializeEmailEnvoiJoursSemaine(null)).toBeNull();
  });

  it("libellé un ou plusieurs jours", () => {
    expect(emailEnvoiJoursSemaineLabel('["MER"]')).toContain("mercredi");
    expect(emailEnvoiJoursSemaineLabel('["MAR","JEU"]')).toContain("mardi");
    expect(emailEnvoiJoursSemaineLabel(null)).toBeNull();
  });

  it("toggle jour", () => {
    expect(toggleEmailEnvoiJour(null, "MER")).toEqual(["MER"]);
    expect(toggleEmailEnvoiJour(["MER"], "MER")).toBeNull();
  });
});
