import { describe, expect, it } from "vitest";
import { buildCifProseBlocks } from "@/components/souscription-cif/CifProse";
import { renderTemplateSegments } from "@/lib/souscription-cif/render-template";

describe("buildCifProseBlocks", () => {
  it("n'affiche qu'une seule ligne vide après un titre souligné", () => {
    const segments = renderTemplateSegments("[u]5. Les risques[/u]\n\nTexte.", {});
    const blocks = buildCifProseBlocks(segments);
    expect(blocks.filter((b) => b.kind === "blank")).toHaveLength(1);
  });

  it("conserve une seule ligne vide entre deux paragraphes texte", () => {
    const segments = renderTemplateSegments("Paragraphe A\n\nParagraphe B", {});
    const blocks = buildCifProseBlocks(segments);
    expect(blocks.filter((b) => b.kind === "blank")).toHaveLength(1);
  });
});
