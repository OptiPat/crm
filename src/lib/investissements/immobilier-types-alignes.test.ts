import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { IMMOBILIER_TYPES } from "./investissement-display";
import { isScpiValorisationType } from "./investissement-encours";

/**
 * Le caractère immobilier d'un placement décide, côté espace client, de
 * l'affichage du loyer et de la mensualité — et de leur enregistrement. Le CRM
 * en tient deux exemplaires, un par langage : celui-ci pour l'interface, celui
 * de Rust pour la photo envoyée au portail et pour l'import.
 *
 * Un type ajouté d'un seul côté ne provoquerait aucune erreur : le client
 * remplirait le loyer, l'écran confirmerait, et le montant serait jeté en
 * silence. Ce test compare les deux listes plutôt que d'espérer la discipline.
 */
const FICHIER_RUST = resolve(
  __dirname,
  "../../../src-tauri/src/espace_client/types_produit.rs"
);

function lireListeRust(nom: string): string[] {
  const source = readFileSync(FICHIER_RUST, "utf8");
  const bloc = source.match(
    new RegExp(`pub const ${nom}: \\[&str; \\d+\\] = \\[([\\s\\S]*?)\\];`)
  );
  if (!bloc) {
    throw new Error(
      `${nom} introuvable dans ${FICHIER_RUST} — le test doit suivre si la constante est renommée.`
    );
  }
  return [...bloc[1].matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

function lireTailleRust(nom: string): number {
  const source = readFileSync(FICHIER_RUST, "utf8");
  const taille = source.match(new RegExp(`pub const ${nom}: \\[&str; (\\d+)\\]`));
  return Number(taille?.[1]);
}

describe("types immobiliers", () => {
  it("la liste Rust est identique à celle du CRM", () => {
    expect(lireListeRust("IMMOBILIER_TYPES")).toEqual([...IMMOBILIER_TYPES]);
  });

  /**
   * La taille est déclarée dans le type Rust : si elle ment, le fichier ne
   * compile pas, mais autant le dire ici plutôt qu'à la compilation.
   */
  it("la taille déclarée côté Rust correspond au nombre d'entrées", () => {
    expect(lireTailleRust("IMMOBILIER_TYPES")).toBe(IMMOBILIER_TYPES.length);
  });
});

/**
 * Le caractère SCPI décide de l'affichage et de l'enregistrement du revenu
 * perçu, et autorise la déclaration même sur un placement suivi par le cabinet.
 * Un type oublié d'un côté ferait disparaître le revenu sans un mot.
 */
describe("types SCPI", () => {
  const TYPES_ATTENDUS = ["SCPI", "SCPI_DEMEMBREMENT", "SCPI_FISCALE"];

  it("le CRM et Rust classent les mêmes types en SCPI", () => {
    for (const type of TYPES_ATTENDUS) {
      expect(isScpiValorisationType(type)).toBe(true);
    }
    expect(isScpiValorisationType("SCI")).toBe(false);
    expect([...lireListeRust("SCPI_TYPES")].sort()).toEqual(
      [...TYPES_ATTENDUS].sort()
    );
  });

  it("la taille déclarée côté Rust correspond au nombre d'entrées", () => {
    expect(lireTailleRust("SCPI_TYPES")).toBe(TYPES_ATTENDUS.length);
  });
});
