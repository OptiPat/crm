import { describe, expect, it } from "vitest";
import { insertTextInPlainField } from "./insert-text-at-cursor";

describe("insertTextInPlainField", () => {
  it("insère au curseur", () => {
    const { value, caret } = insertTextInPlainField(
      "Bonjour ",
      "{{prenom}}",
      { start: 8, end: 8 }
    );
    expect(value).toBe("Bonjour {{prenom}}");
    expect(caret).toBe(18);
  });

  it("remplace la sélection", () => {
    const { value } = insertTextInPlainField(
      "Bonjour monde",
      "{{prenom}}",
      { start: 0, end: 13 }
    );
    expect(value).toBe("{{prenom}}");
  });

  it("ajoute en fin sans sélection", () => {
    const { value, caret } = insertTextInPlainField("Objet", " {{nom}}", null);
    expect(value).toBe("Objet {{nom}}");
    expect(caret).toBe(13);
  });
});
