import { describe, expect, it } from "vitest";
import {
  isScpiBulletinTemplateNom,
  stampScpiBulletinTemplateMeta,
} from "./scpi-template-meta";
import { parseTemplateEmailMeta } from "./template-email-html";

describe("scpi-template-meta", () => {
  it("repère les modèles bulletin SCPI", () => {
    expect(isScpiBulletinTemplateNom("Bulletin SCPI trimestriel")).toBe(true);
    expect(isScpiBulletinTemplateNom("Relance")).toBe(false);
  });

  it("marque le modèle personnalisé pour bloquer la migration auto", () => {
    const vars = stampScpiBulletinTemplateMeta(
      '{"corps_html":"<p>Intro perso</p>"}',
      "Bulletin SCPI trimestriel (tu)"
    );
    const meta = parseTemplateEmailMeta(vars);
    expect(meta.scpi_template_user_customized).toBe(true);
    expect(meta.scpi_template_version).toBe(4);
  });
});
