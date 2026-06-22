/** Tableau horizon / profil — annexes Capital investissement § 4. */

import {
  INVESTISSEUR_SRI_PROFILES,
  isValidSri,
} from "@/lib/contacts/investisseur-sri";
import {
  formatHorizonProfilCheck,
  type AnnexesScpiHorizonProfilRowView,
} from "@/lib/souscription-cif/annexes-scpi-horizon-profil-table";

/** Horizon type capital investissement — « de 7 à 10 ans » coché. */
const ANNEXES_CAPITAL_INVEST_HORIZON_OPTIONS: ReadonlyArray<{ label: string; checked: boolean }> =
  [
    { label: "< à 2 ans", checked: false },
    { label: "de 2 à 7 ans", checked: false },
    { label: "de 7 à 10 ans", checked: true },
  ];

export function buildAnnexesCapitalInvestHorizonProfilRowViews(
  profilRisqueSri?: number | null
): ReadonlyArray<AnnexesScpiHorizonProfilRowView> {
  const selectedSri = isValidSri(profilRisqueSri ?? NaN) ? profilRisqueSri! : null;

  const horizonRows: AnnexesScpiHorizonProfilRowView[] = ANNEXES_CAPITAL_INVEST_HORIZON_OPTIONS.map(
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
