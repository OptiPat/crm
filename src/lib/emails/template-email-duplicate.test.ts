import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TemplateEmail } from "@/lib/api/tauri-templates-email";

const created: Array<{ id: number; nom: string; tu: number | null; rel: number | null; vars: string | null }> = [];
let nextId = 100;
const rolledBack: number[] = [];
let failAttachmentCopy = false;

vi.mock("@/lib/api/tauri-templates-email", () => ({
  createTemplateEmail: vi.fn(async (t) => {
    const row = {
      id: nextId++,
      created_at: 0,
      updated_at: 0,
      relance_template_id: t.relance_template_id ?? null,
      tutoiement_template_id: t.tutoiement_template_id ?? null,
      agenda_link_id: t.agenda_link_id ?? null,
      ...t,
      variables: t.variables ?? null,
    };
    created.push({
      id: row.id,
      nom: t.nom,
      tu: row.tutoiement_template_id,
      rel: row.relance_template_id,
      vars: row.variables,
    });
    return row;
  }),
  updateTemplateEmail: vi.fn(async (id, t) => ({ ...t, id })),
  deleteDetachedTemplateChildren: vi.fn(async (ids: number[]) => {
    rolledBack.push(...ids);
    return ids;
  }),
}));
vi.mock("@/lib/api/tauri-template-email-attachments", () => ({
  copyTemplateEmailAttachments: vi.fn(async () => {
    if (failAttachmentCopy) throw new Error("fichier introuvable");
    return [];
  }),
}));

import { duplicateTemplateEmail, stripAutomaticSendingFromMeta } from "./template-email-duplicate";

function tpl(over: Partial<TemplateEmail>): TemplateEmail {
  return {
    id: 1,
    nom: "Suivi annuel",
    sujet: "Objet",
    corps: "Corps",
    categorie: "SUIVI_ANNUEL",
    variables: null,
    agenda_link_id: null,
    relance_template_id: null,
    tutoiement_template_id: null,
    created_at: 0,
    updated_at: 0,
    ...over,
  };
}

describe("duplication de modèle", () => {
  beforeEach(() => {
    created.length = 0;
    nextId = 100;
    rolledBack.length = 0;
    failAttachmentCopy = false;
  });

  it("retire tous les envois automatiques, garde la relance", () => {
    const meta = JSON.stringify({
      email_trigger: { enabled: true, condition_type: "EVENEMENT_SOUSCRIPTION" },
      pipe_rdv_trigger: { enabled: true, stages: ["R1"] },
      pipe_rdv_reminder: { enabled: true, reminder_template_id: 9 },
      pipe_rdv_follow_up: { enabled: true, follow_up_template_id: 10 },
      placement_conforme_trigger: { enabled: true, stellium_labels: ["x"] },
      email_relance: { enabled: true, delai_jours: 5 },
    });
    const out = JSON.parse(stripAutomaticSendingFromMeta(meta)!);
    expect(Object.keys(out)).toEqual(["email_relance"]);
  });

  it("copie aussi la version tu, la relance et la relance tu, reliées à la copie", async () => {
    const tu = tpl({ id: 2, nom: "Suivi annuel (tu)" });
    const relTu = tpl({ id: 4, nom: "Relance — Suivi annuel (tu)", categorie: "RELANCE" });
    const rel = tpl({
      id: 3,
      nom: "Relance — Suivi annuel",
      categorie: "RELANCE",
      tutoiement_template_id: 4,
    });
    const parent = tpl({
      relance_template_id: 3,
      tutoiement_template_id: 2,
      variables: JSON.stringify({ email_trigger: { enabled: true } }),
    });
    const copy = await duplicateTemplateEmail(parent, [parent, tu, rel, relTu]);

    expect(copy.nom).toBe("Suivi annuel (copie)");
    const byNom = Object.fromEntries(created.map((c) => [c.nom, c]));
    expect(byNom["Suivi annuel (copie) (tu)"]).toBeDefined();
    expect(byNom["Relance — Suivi annuel (copie)"].tu).toBe(
      byNom["Relance — Suivi annuel (copie) (tu)"].id
    );
    const parentCopy = byNom["Suivi annuel (copie)"];
    expect(parentCopy.tu).toBe(byNom["Suivi annuel (copie) (tu)"].id);
    expect(parentCopy.rel).toBe(byNom["Relance — Suivi annuel (copie)"].id);
    expect(parentCopy.vars ?? "").not.toContain("email_trigger");
    // L'original n'est jamais réutilisé.
    expect(created.every((c) => ![1, 2, 3, 4].includes(c.id))).toBe(true);
  });

  it("échec en cours de route : les copies déjà créées sont supprimées", async () => {
    const tu = tpl({ id: 2, nom: "Suivi annuel (tu)" });
    const withAttachment = JSON.stringify({
      attachments: [
        { id: "a", template_id: 1, stored_name: "x.pdf", filename: "x.pdf", mime_type: "", size_bytes: 1 },
      ],
    });
    const parent = tpl({ tutoiement_template_id: 2, variables: withAttachment });
    failAttachmentCopy = true;
    await expect(duplicateTemplateEmail(parent, [parent, tu])).rejects.toThrow("fichier introuvable");
    expect(rolledBack.sort()).toEqual(created.map((c) => c.id).sort());
  });
});
