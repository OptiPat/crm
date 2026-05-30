import { describe, expect, it } from "vitest";
import { formatAlerteContactLabel } from "./tauri-alertes";

describe("formatAlerteContactLabel", () => {
  it("garde le message entier pour fin démembrement", () => {
    const msg = 'Fin de démembrement SCPI "Comete" prévue le 05/06/2026';
    expect(formatAlerteContactLabel(msg, "FIN_DEMEMBREMENT")).toBe(msg);
  });

  it("extrait le nom avant le tiret pour suivi client", () => {
    expect(
      formatAlerteContactLabel("Jean NOM1 - Suivi +1 an", "SUIVI_CLIENT_1AN")
    ).toBe("Jean NOM1");
  });

  it("retire les emojis de préfixe", () => {
    expect(formatAlerteContactLabel("🔴 Jean NOM1 - alerte")).toBe("Jean NOM1");
  });
});
