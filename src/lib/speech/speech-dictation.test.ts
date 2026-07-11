import { describe, expect, it } from "vitest";
import { appendDictationText, extractFinalTranscript } from "./speech-dictation";

describe("speech-dictation", () => {
  it("concatène la dictée au texte existant", () => {
    expect(appendDictationText("", "Bonjour")).toBe("Bonjour");
    expect(appendDictationText("Déjà noté", "suite")).toBe("Déjà noté suite");
    expect(appendDictationText("Ligne\n", "suite")).toBe("Ligne\nsuite");
  });

  it("extrait les segments finaux", () => {
    const transcript = extractFinalTranscript({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: "Premier " } },
        { isFinal: true, 0: { transcript: "mot" } },
        { isFinal: false, 0: { transcript: " brouillon" } },
      ],
    });
    expect(transcript).toBe("Premier mot");
  });
});
