/** Tableau horizon / profil — annexes Girardin industriel (G3F) § 4. */

import {
  INVESTISSEUR_SRI_PROFILES,
  isValidSri,
} from "@/lib/contacts/investisseur-sri";
import {
  formatHorizonProfilCheck,
  type AnnexesScpiHorizonProfilRowView,
} from "@/lib/souscription-cif/annexes-scpi-horizon-profil-table";

/** Horizon type G3F — « de 3 à 8 ans » coché. */
const ANNEXES_G3F_HORIZON_OPTIONS: ReadonlyArray<{ label: string; checked: boolean }> = [
  { label: "< à 3 ans", checked: false },
  { label: "de 3 à 8 ans", checked: true },
  { label: "+ de 10 ans", checked: false },
];

export function buildAnnexesG3fHorizonProfilRowViews(
  profilRisqueSri?: number | null
): ReadonlyArray<AnnexesScpiHorizonProfilRowView> {
  const selectedSri = isValidSri(profilRisqueSri ?? NaN) ? profilRisqueSri! : null;

  const horizonRows: AnnexesScpiHorizonProfilRowView[] = ANNEXES_G3F_HORIZON_OPTIONS.map(
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

export { formatHorizonProfilCheck };
