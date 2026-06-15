/** Tableau horizon / profil — annexes SCPI page 6 § 4. */

import {
  INVESTISSEUR_SRI_PROFILES,
  isValidSri,
} from "@/lib/contacts/investisseur-sri";
import {
  ANNEXES_SCPI_CARACTERISTIQUES_CHECKED,
  ANNEXES_SCPI_CARACTERISTIQUES_UNCHECKED,
} from "@/lib/souscription-cif/annexes-scpi-caracteristiques-operation-table";

export type AnnexesScpiHorizonProfilHorizonCell =
  | { kind: "check"; label: string; checked: boolean }
  | { kind: "empty" };

export type AnnexesScpiHorizonProfilRowView = {
  horizon: AnnexesScpiHorizonProfilHorizonCell;
  profileSri: number;
  profileLabel: string;
  profileChecked: boolean;
};

/** Horizon type SCPI de rendement — « + de 10 ans » coché. */
const ANNEXES_SCPI_HORIZON_OPTIONS: ReadonlyArray<{ label: string; checked: boolean }> = [
  { label: "< à 3 ans", checked: false },
  { label: "de 3 à 8 ans", checked: false },
  { label: "+ de 10 ans", checked: true },
];

export function formatHorizonProfilCheck(checked: boolean): string {
  return checked ? ANNEXES_SCPI_CARACTERISTIQUES_CHECKED : ANNEXES_SCPI_CARACTERISTIQUES_UNCHECKED;
}

export function buildAnnexesScpiHorizonProfilRowViews(
  profilRisqueSri?: number | null
): ReadonlyArray<AnnexesScpiHorizonProfilRowView> {
  const selectedSri = isValidSri(profilRisqueSri ?? NaN) ? profilRisqueSri! : null;

  const horizonRows: AnnexesScpiHorizonProfilRowView[] = ANNEXES_SCPI_HORIZON_OPTIONS.map(
    (option, index) => {
      const profile = INVESTISSEUR_SRI_PROFILES[index];
      return {
        horizon: { kind: "check", label: option.label, checked: option.checked },
        profileSri: profile.sri,
        profileLabel: profile.label,
        profileChecked: selectedSri != null && profile.sri === selectedSri,
      };
    }
  );

  const extraProfileRows: AnnexesScpiHorizonProfilRowView[] = INVESTISSEUR_SRI_PROFILES.filter(
    (p) => p.sri >= 4
  ).map((profile) => ({
    horizon: { kind: "empty" as const },
    profileSri: profile.sri,
    profileLabel: profile.label,
    profileChecked: selectedSri != null && profile.sri === selectedSri,
  }));

  return [...horizonRows, ...extraProfileRows];
}
