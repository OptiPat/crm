import { describe, expect, it, vi, beforeEach } from "vitest";
import {
  buildUpsertFilleulDossierInput,
  dossierDateInputToTimestamp,
  dossierDateToInput,
  emptyFilleulDossier,
  indexFilleulDossiersByContactId,
  mergeLegacyFilleulDossierView,
  resolveFilleulInscriptionTimestamp,
  resolveFilleulInvitationTimestamp,
  resolveFilleulCategorieAfterDesinscriptionDateChange,
} from "@/lib/organisation/organisation-filleul-dossier";

const invoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => invoke(...args),
}));

describe("organisation-filleul-dossier", () => {
  beforeEach(() => {
    invoke.mockReset();
  });

  it("indexe les dossiers par contact", () => {
    const map = indexFilleulDossiersByContactId([
      { ...emptyFilleulDossier(1), dateInvitation: 100 },
      { ...emptyFilleulDossier(2), notes: "x" },
    ]);
    expect(map.get(1)?.dateInvitation).toBe(100);
    expect(map.get(2)?.notes).toBe("x");
  });

  it("convertit les champs date input", () => {
    expect(dossierDateToInput(1_704_067_200)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const ts = dossierDateInputToTimestamp("2024-03-15");
    expect(ts).not.toBeNull();
    expect(dossierDateInputToTimestamp("")).toBeNull();
  });

  it("construit un upsert avec patch partiel", () => {
    const base = emptyFilleulDossier(5);
    const input = buildUpsertFilleulDossierInput(base, {
      dateInscription: "2024-03-15",
      notes: "  Suivi réseau  ",
    });
    expect(input.contactId).toBe(5);
    expect(input.dateInscription).not.toBeNull();
    expect(input.notes).toBe("Suivi réseau");
    expect(input.dateInvitation).toBeNull();
  });

  it("résout les dates réseau avec priorité dossier", () => {
    const contact = { date_invitation_filleul: 100, date_inscription_filleul: 200 };
    const dossier = {
      ...emptyFilleulDossier(1),
      dateInvitation: 300,
      dateInscription: 400,
      updatedAt: 1,
    };
    expect(resolveFilleulInvitationTimestamp(contact, dossier)).toBe(300);
    expect(resolveFilleulInscriptionTimestamp(contact, dossier)).toBe(400);
    expect(resolveFilleulInvitationTimestamp(contact)).toBe(100);
  });

  it("n'utilise pas le legacy quand le dossier a effacé une date", () => {
    const contact = { date_invitation_filleul: 100, date_inscription_filleul: 200 };
    const dossier = { ...emptyFilleulDossier(1), dateInvitation: null, updatedAt: 1 };
    expect(resolveFilleulInvitationTimestamp(contact, dossier)).toBeNull();
  });

  it("repli legacy pour la vue dossier sans ligne DB", () => {
    const merged = mergeLegacyFilleulDossierView(
      { id: 7, date_invitation_filleul: 100, date_inscription_filleul: 200 },
      undefined
    );
    expect(merged.contactId).toBe(7);
    expect(merged.dateInvitation).toBe(100);
    expect(merged.dateInscription).toBe(200);
    expect(merged.updatedAt).toBe(0);
  });

  it("repli legacy même si le dossier est un shell vide non-null (get_filleul_dossier sans ligne)", () => {
    const merged = mergeLegacyFilleulDossierView(
      { id: 8, date_invitation_filleul: 100, date_inscription_filleul: 200 },
      emptyFilleulDossier(8)
    );
    expect(merged.dateInvitation).toBe(100);
    expect(merged.dateInscription).toBe(200);
  });

  it("ne repli pas la legacy quand une vraie ligne dossier existe (updatedAt > 0)", () => {
    const dossier = { ...emptyFilleulDossier(9), dateInvitation: null, updatedAt: 1 };
    const merged = mergeLegacyFilleulDossierView(
      { id: 9, date_invitation_filleul: 100, date_inscription_filleul: 200 },
      dossier
    );
    expect(merged.dateInvitation).toBeNull();
  });

  it("upsertFilleulDossierDatesFromImport repart du dossier existant (pas d'un shell vide)", async () => {
    const { upsertFilleulDossierDatesFromImport } = await import(
      "@/lib/organisation/organisation-filleul-dossier"
    );
    invoke.mockImplementation((cmd: string) => {
      if (cmd === "get_filleul_dossier") {
        return Promise.resolve({
          ...emptyFilleulDossier(42),
          dateDesinscription: 999,
          datePassageManager: 555,
          updatedAt: 1,
        });
      }
      if (cmd === "upsert_filleul_dossier") {
        return Promise.resolve(emptyFilleulDossier(42));
      }
      throw new Error(`commande inattendue : ${cmd}`);
    });

    await upsertFilleulDossierDatesFromImport(42, { dateInscription: "2024-03-15" });

    expect(invoke).toHaveBeenCalledWith("get_filleul_dossier", { contactId: 42 });
    const upsertCall = invoke.mock.calls.find(([cmd]) => cmd === "upsert_filleul_dossier");
    expect(upsertCall?.[1].input.dateDesinscription).toBe(999);
    expect(upsertCall?.[1].input.datePassageManager).toBe(555);
    expect(upsertCall?.[1].input.dateInscription).not.toBeNull();
  });

  it("aligne le statut réseau après date de désinscription", () => {
    expect(
      resolveFilleulCategorieAfterDesinscriptionDateChange(
        { filleul_categorie: "FILLEUL", categorie: "AUCUN" },
        "2024-06-01"
      )
    ).toBe("FILLEUL_DESINSCRIT");
    expect(
      resolveFilleulCategorieAfterDesinscriptionDateChange(
        { filleul_categorie: "FILLEUL_DESINSCRIT", categorie: "AUCUN" },
        ""
      )
    ).toBe("FILLEUL");
    expect(
      resolveFilleulCategorieAfterDesinscriptionDateChange(
        { filleul_categorie: "PROSPECT_FILLEUL", categorie: "AUCUN" },
        "2024-06-01"
      )
    ).toBeUndefined();
  });
});
