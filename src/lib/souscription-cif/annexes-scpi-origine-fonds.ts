/** Déclaration origine des fonds — annexes SCPI page 7 § 5. */

import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";
import {
  ANNEXES_SCPI_CARACTERISTIQUES_CHECKED,
  ANNEXES_SCPI_CARACTERISTIQUES_UNCHECKED,
} from "@/lib/souscription-cif/annexes-scpi-caracteristiques-operation-table";

export type ProvenanceFonds = "" | "metropole" | "dom_tom" | "etranger";

export type OrigineFondsKey =
  | "epargne_courante"
  | "jeu"
  | "epargne_constituee"
  | "donation"
  | "immo"
  | "indemnites"
  | "actifs_mobiliers"
  | "reemploi"
  | "vente_societe"
  | "autre";

export const PROVENANCE_FONDS_OPTIONS: ReadonlyArray<{
  key: Exclude<ProvenanceFonds, "">;
  label: string;
}> = [
  { key: "metropole", label: "Métropole" },
  { key: "dom_tom", label: "DOM-TOM" },
  { key: "etranger", label: "Étranger" },
];

export const ORIGINE_FONDS_OPTIONS: ReadonlyArray<{
  key: OrigineFondsKey;
  label: string;
}> = [
  { key: "epargne_courante", label: "Épargne courante, trésorerie mensuelle" },
  { key: "jeu", label: "Gain au jeu (lettre chèque)" },
  { key: "epargne_constituee", label: "Épargne déjà constituée (relevé de compte)" },
  { key: "donation", label: "Donation / Héritage (acte notarié)" },
  { key: "immo", label: "Vente d'un bien immobilier (acte notarié)" },
  { key: "indemnites", label: "Prestations / Indemnités (courrier entreprise)" },
  { key: "actifs_mobiliers", label: "Vente d'actifs mobiliers (relevé titre)" },
  { key: "reemploi", label: "Réemploi des fonds (relevé d'opération)" },
  { key: "vente_societe", label: "Vente de société (acte de vente)" },
  { key: "autre", label: "Autre (préciser et justifier)" },
];

/** Paires colonnes gauche / droite — tableau origine des fonds. */
export const ORIGINE_FONDS_ROW_PAIRS: ReadonlyArray<[OrigineFondsKey, OrigineFondsKey]> = [
  ["epargne_courante", "jeu"],
  ["epargne_constituee", "donation"],
  ["immo", "indemnites"],
  ["actifs_mobiliers", "reemploi"],
  ["vente_societe", "autre"],
];

const ORIGINE_FONDS_KEY_SET = new Set<string>(ORIGINE_FONDS_OPTIONS.map((o) => o.key));

export function normalizeOrigineFondsSelected(raw: unknown): OrigineFondsKey[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((k): k is OrigineFondsKey => typeof k === "string" && ORIGINE_FONDS_KEY_SET.has(k));
}

export function normalizeProvenanceFonds(raw: unknown): ProvenanceFonds {
  if (raw === "metropole" || raw === "dom_tom" || raw === "etranger") return raw;
  return "";
}

export function formatOrigineFondsCheck(checked: boolean): string {
  return checked ? ANNEXES_SCPI_CARACTERISTIQUES_CHECKED : ANNEXES_SCPI_CARACTERISTIQUES_UNCHECKED;
}

export function getOrigineFondsLabel(key: OrigineFondsKey): string {
  return ORIGINE_FONDS_OPTIONS.find((o) => o.key === key)?.label ?? key;
}

export type AnnexesScpiOrigineFondsView = {
  provenanceFonds: ProvenanceFonds;
  origineFondsSelected: ReadonlyArray<OrigineFondsKey>;
  origineFondsAutrePrecision: string;
};

export function buildAnnexesScpiOrigineFondsView(
  dossier: SouscriptionDossierFields
): AnnexesScpiOrigineFondsView {
  return {
    provenanceFonds: dossier.provenanceFonds,
    origineFondsSelected: dossier.origineFondsSelected,
    origineFondsAutrePrecision: dossier.origineFondsAutrePrecision.trim(),
  };
}

export function collectAnnexesOrigineFondsMissingKeys(dossier: SouscriptionDossierFields): string[] {
  const missing: string[] = [];
  if (!dossier.provenanceFonds) missing.push("provenance_fonds");
  if (dossier.origineFondsSelected.length === 0) missing.push("origine_fonds");
  return missing;
}

export function isOrigineFondsSelected(
  selected: ReadonlyArray<OrigineFondsKey>,
  key: OrigineFondsKey
): boolean {
  return selected.includes(key);
}
