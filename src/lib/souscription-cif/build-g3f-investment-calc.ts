import { parseEuroInput } from "@/lib/souscription-cif/build-annexes-scpi-costs";
import type { SouscriptionDossierFields } from "@/lib/souscription-cif/dossier-fields";

const G3F_EURO_FORMAT = new Intl.NumberFormat("fr-FR", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

/** Montant formaté sans suffixe € (le texte annexes l'ajoute). */
export function formatG3fEuroDisplay(raw: string): string | null {
  const n = parseEuroInput(raw);
  if (n == null) return null;
  return G3F_EURO_FORMAT.format(n);
}

/** Total apport : saisi explicitement, ou apport + frais si les deux sont renseignés. */
export function resolveG3fTotalApportDisplay(
  apportRaw: string,
  fraisRaw: string,
  totalOverrideRaw: string
): string | null {
  const override = formatG3fEuroDisplay(totalOverrideRaw);
  if (totalOverrideRaw.trim()) return override;
  const apport = parseEuroInput(apportRaw);
  const frais = parseEuroInput(fraisRaw);
  if (apport == null || frais == null) return null;
  return G3F_EURO_FORMAT.format(apport + frais);
}

export function buildG3fInvestmentVariables(
  dossier: SouscriptionDossierFields
): Record<string, string | null> {
  return {
    g3f_annee_impot: dossier.g3fAnneeImpot.trim() || null,
    g3f_montant_impot: formatG3fEuroDisplay(dossier.g3fMontantImpotEur),
    g3f_montant_reduction_souhaitee: formatG3fEuroDisplay(
      dossier.g3fReductionSouhaiteeEur
    ),
    g3f_montant_apport: formatG3fEuroDisplay(dossier.g3fMontantApportEur),
    g3f_frais_enregistrement: formatG3fEuroDisplay(dossier.g3fFraisEnregistrementEur),
    g3f_total_apport: resolveG3fTotalApportDisplay(
      dossier.g3fMontantApportEur,
      dossier.g3fFraisEnregistrementEur,
      dossier.g3fTotalApportEur
    ),
    g3f_annee_loi_finances: dossier.g3fAnneeLoiFinances.trim() || null,
    g3f_annee_souscription: dossier.g3fAnneeSouscription.trim() || null,
    g3f_annee_declaration_revenus: dossier.g3fAnneeDeclarationRevenus.trim() || null,
  };
}
