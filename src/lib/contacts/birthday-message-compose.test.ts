import { describe, expect, it } from "vitest";
import {
  buildBirthdayEditorDraft,
  composeBirthdayMessagePreview,
  EMPTY_BIRTHDAY_PROFILE,
  extractBirthdayPrenom,
  genreFromCivilite,
  pickProfileBodies,
  profileSliceKey,
  registreFromContact,
  resolveBirthdaySaveSettings,
  resolvePreviewTemplates,
  previewVariantIndex,
  syncBirthdayMessageUseCustom,
} from "./birthday-message-compose";

const emptySettings = {
  useCustom: false,
  bodiesTu: [] as string[],
  bodiesVous: [] as string[],
  profile: { ...EMPTY_BIRTHDAY_PROFILE },
};

const sampleBuiltin = {
  profile: {
    tuM: ["Salut {prenom}, joyeux anniversaire !\nCorps tu M.\nÀ très vite."],
    tuF: ["Salut {prenom}, joyeux anniversaire !\nCorps tu F.\nÀ très vite."],
    tuN: ["Salut {prenom}, joyeux anniversaire !\nCorps tu N.\nÀ très vite."],
    vousM: ["Bonjour {prenom}, joyeux anniversaire !\nCorps vous M.\nÀ bientôt."],
    vousF: ["Bonjour {prenom}, joyeux anniversaire !\nCorps vous F.\nÀ bientôt."],
    vousN: ["Bonjour {prenom}, joyeux anniversaire !\nCorps vous N.\nÀ bientôt."],
  },
};

describe("birthday-message-compose", () => {
  it("extractBirthdayPrenom prend le premier mot", () => {
    expect(extractBirthdayPrenom("Jean-Pierre", "DUPONT Jean-Pierre")).toBe("Jean-Pierre");
    expect(extractBirthdayPrenom("", "Marie LEGRAND")).toBe("Marie");
  });

  it("registreFromContact", () => {
    expect(registreFromContact("TU")).toBe("TU");
    expect(registreFromContact("vous")).toBe("VOUS");
  });

  it("genreFromCivilite", () => {
    expect(genreFromCivilite("Mme")).toBe("F");
    expect(genreFromCivilite("M")).toBe("M");
    expect(genreFromCivilite(undefined)).toBe("N");
  });

  it("profileSliceKey", () => {
    expect(profileSliceKey("TU", "F")).toBe("tuF");
    expect(profileSliceKey("VOUS", "M")).toBe("vousM");
  });

  it("pickProfileBodies retourne la tranche genre", () => {
    const bodies = pickProfileBodies(sampleBuiltin.profile, "TU", "F");
    expect(bodies[0]).toContain("Corps tu F.");
    expect(bodies[0]).toContain("Salut {prenom}, joyeux anniversaire !");
  });

  it("syncBirthdayMessageUseCustom active à l'ajout d'une variante vide", () => {
    const next = syncBirthdayMessageUseCustom(emptySettings, {
      profile: { tuM: [""] },
    });
    expect(next.useCustom).toBe(true);
  });

  it("syncBirthdayMessageUseCustom respecte désactivation manuelle", () => {
    const next = syncBirthdayMessageUseCustom(
      { ...emptySettings, useCustom: true, profile: { ...EMPTY_BIRTHDAY_PROFILE, tuM: ["Hello"] } },
      { useCustom: false }
    );
    expect(next.useCustom).toBe(false);
  });

  it("syncBirthdayMessageUseCustom désactive si tout vide", () => {
    const next = syncBirthdayMessageUseCustom(
      { ...emptySettings, useCustom: true, profile: { ...EMPTY_BIRTHDAY_PROFILE, tuM: ["  "] } },
      { profile: { tuM: [] } }
    );
    expect(next.useCustom).toBe(false);
  });

  it("resolveBirthdaySaveSettings active après modification", () => {
    const saved = resolveBirthdaySaveSettings(
      {
        ...emptySettings,
        useCustom: true,
        profile: { ...sampleBuiltin.profile, tuM: ["Salut {prenom}, joyeux anniversaire !\nModifié.\nÀ très vite."] },
      },
      sampleBuiltin
    );
    expect(saved.useCustom).toBe(true);
    expect(saved.profile.tuM[0]).toContain("Modifié.");
  });

  it("resolveBirthdaySaveSettings désactive même si profil modifié", () => {
    const saved = resolveBirthdaySaveSettings(
      {
        ...emptySettings,
        useCustom: false,
        profile: { ...sampleBuiltin.profile, tuM: ["Texte modifié non enregistré"] },
      },
      sampleBuiltin
    );
    expect(saved.useCustom).toBe(false);
    expect(saved.profile.tuM).toEqual([]);
  });

  it("resolveBirthdaySaveSettings garde intégré si inchangé", () => {
    const saved = resolveBirthdaySaveSettings(
      { ...emptySettings, useCustom: false, profile: { ...sampleBuiltin.profile } },
      sampleBuiltin
    );
    expect(saved.useCustom).toBe(false);
  });

  it("resolvePreviewTemplates utilise le brouillon puis intégré", () => {
    const emptyBuiltin = { profile: { ...EMPTY_BIRTHDAY_PROFILE } };
    const fromDraft = resolvePreviewTemplates(
      { ...emptySettings, profile: sampleBuiltin.profile },
      emptyBuiltin,
      "TU",
      "F"
    );
    expect(fromDraft[0]).toContain("Corps tu F.");

    const fromBuiltin = resolvePreviewTemplates(emptySettings, sampleBuiltin, "TU", "F");
    expect(fromBuiltin[0]).toContain("Corps tu F.");
  });

  it("previewVariantIndex est stable pour un seed", () => {
    expect(previewVariantIndex("contact-42", 6)).toBe(previewVariantIndex("contact-42", 6));
    expect(previewVariantIndex("contact-42", 6)).toBeGreaterThanOrEqual(0);
    expect(previewVariantIndex("contact-42", 6)).toBeLessThan(6);
  });

  it("buildBirthdayEditorDraft préremplit depuis intégré", () => {
    const draft = buildBirthdayEditorDraft(emptySettings, sampleBuiltin);
    expect(draft.profile.tuM[0]).toContain("Corps tu M.");
    expect(draft.profile.vousF[0]).toContain("Corps vous F.");
  });

  it("compose message complet avec placeholder prenom", () => {
    const msg = composeBirthdayMessagePreview(
      "Paul",
      "TU",
      "Salut {prenom}, joyeux anniversaire !\nBelle journée {prenom} !\nÀ très vite."
    );
    expect(msg).toBe(
      "Salut Paul, joyeux anniversaire !\nBelle journée Paul !\nÀ très vite."
    );
  });

  it("compose legacy corps seul avec salutation auto", () => {
    const msg = composeBirthdayMessagePreview("Paul", "TU", "Belle journée {prenom} !");
    expect(msg).toBe(
      "Salut Paul, joyeux anniversaire !\nBelle journée Paul !\nÀ très vite."
    );
  });

  it("compose vous", () => {
    const msg = composeBirthdayMessagePreview(
      "Alice",
      "VOUS",
      "Bonjour {prenom}, joyeux anniversaire !\nCordialement.\nÀ bientôt."
    );
    expect(msg.startsWith("Bonjour Alice, joyeux anniversaire !")).toBe(true);
    expect(msg.endsWith("À bientôt.")).toBe(true);
  });
});
