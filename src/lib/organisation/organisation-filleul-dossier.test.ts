import { describe, expect, it } from "vitest";
import {
  buildUpsertFilleulDossierInput,
  dossierDateInputToTimestamp,
  dossierDateToInput,
  emptyFilleulDossier,
  indexFilleulDossiersByContactId,
  mergeLegacyFilleulDossierView,
  resolveFilleulInscriptionTimestamp,
  resolveFilleulInvitationTimestamp,
} from "@/lib/organisation/organisation-filleul-dossier";

describe("organisation-filleul-dossier", () => {
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
});
