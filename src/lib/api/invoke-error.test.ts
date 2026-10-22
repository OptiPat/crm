import { afterEach, describe, expect, it, vi } from "vitest";
import { invokeErrorMessage, userErrorMessage } from "./invoke-error";

describe("invokeErrorMessage", () => {
  it("lit une chaîne ou une Error", () => {
    expect(invokeErrorMessage("boom")).toBe("boom");
    expect(invokeErrorMessage(new Error("boom"))).toBe("boom");
  });
});

describe("userErrorMessage", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("ajoute une cause française courte (rejet Tauri en chaîne)", () => {
    expect(
      userErrorMessage("Cet email est déjà utilisé par un autre contact", "Impossible d'enregistrer le contact.")
    ).toBe("Impossible d'enregistrer le contact : Cet email est déjà utilisé par un autre contact");
  });

  it("ajoute une cause française courte (Error)", () => {
    expect(userErrorMessage(new Error("Le fichier est introuvable"), "Import impossible")).toBe(
      "Import impossible : Le fichier est introuvable"
    );
  });

  it("garde le fallback seul pour un message technique anglais", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const raw = "Failed to update contact: UNIQUE constraint failed: contacts.email";
    expect(userErrorMessage(raw, "Impossible d'enregistrer le contact")).toBe(
      "Impossible d'enregistrer le contact"
    );
    expect(spy).toHaveBeenCalledWith("Impossible d'enregistrer le contact —", raw);
  });

  it("garde le fallback seul pour une erreur base de données", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(userErrorMessage(new Error("Database is locked"), "Erreur de chargement")).toBe(
      "Erreur de chargement"
    );
    expect(userErrorMessage("Contact not found", "Contact introuvable")).toBe("Contact introuvable");
  });

  it("garde le fallback seul pour un texte trop long ou multiligne", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    expect(userErrorMessage(`Le serveur ${"a".repeat(200)}`, "Échec")).toBe("Échec");
    expect(userErrorMessage("La ligne 1\nLa ligne 2", "Échec")).toBe("Échec");
  });

  it("renvoie la cause seule si elle reprend déjà le repli", () => {
    expect(
      userErrorMessage(
        "Impossible d'enregistrer le contact : email déjà utilisé",
        "Impossible d'enregistrer le contact."
      )
    ).toBe("Impossible d'enregistrer le contact : email déjà utilisé");
    expect(userErrorMessage("Impossible de joindre le serveur", "Impossible d'envoyer l'email")).toBe(
      "Impossible de joindre le serveur"
    );
  });

  it("n'en dit pas deux fois et gère les erreurs vides", () => {
    expect(userErrorMessage("Contact introuvable", "Contact introuvable")).toBe("Contact introuvable");
    expect(userErrorMessage(undefined, "Échec")).toBe("Échec");
    expect(userErrorMessage({ message: "Aucune connexion Internet" }, "Envoi impossible")).toBe(
      "Envoi impossible : Aucune connexion Internet"
    );
  });
});
