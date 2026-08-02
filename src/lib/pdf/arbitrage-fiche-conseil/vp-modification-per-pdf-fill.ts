import { formatVpModificationMontantPdfText } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-pdf-fill";
import type { VpModificationPdfFillInput } from "@/lib/pdf/arbitrage-fiche-conseil/vp-modification-types";

/** Zone « L'allocation d'actifs et l'opération (type opération, montant ...) » sur le modèle PER. */
export const VP_MODIFICATION_PER_OPERATION_TEXT_FIELD = "Text3";

const VP_MODIFICATION_ALLOCATION_TEXT =
  "Vos versements programmés s'effectueront sur une allocation différente de celle actuellement en place afin de bénéficier et de capitaliser sur des stratégies d'investissement complémentaires et d'autre part de renforcer la diversification globale de votre contrat.";

const CRM_FREQUENCE_LABEL: Record<string, string> = {
  MENSUEL: "mensuelle",
  TRIMESTRIEL: "trimestrielle",
  SEMESTRIEL: "semestrielle",
  ANNUEL: "annuelle",
};

export function buildVpModificationPerOperationText(
  input: VpModificationPdfFillInput
): string | null {
  if (input.kinds.length === 0) return null;

  const lines = ["Type opération : Modification des versements programmés"];

  if (input.kinds.includes("montant")) {
    const centimes = input.montantCentimes;
    if (centimes != null && centimes > 0) {
      lines.push(`Montant : ${formatVpModificationMontantPdfText(centimes)} €`);
    } else {
      lines.push("Montant : modification demandée");
    }
  }

  if (input.kinds.includes("allocation")) {
    lines.push(`Allocation : ${VP_MODIFICATION_ALLOCATION_TEXT}`);
  }

  if (input.kinds.includes("periodicite")) {
    const frequence = input.frequence?.trim().toUpperCase() ?? "";
    const label = CRM_FREQUENCE_LABEL[frequence];
    lines.push(
      label
        ? `Périodicité : ${label}`
        : "Périodicité : modification demandée"
    );
  }

  return lines.join("\r\n");
}

function setPdfTextField(form: import("pdf-lib").PDFForm, name: string, value: string): void {
  try {
    form.getTextField(name).setText(value);
  } catch {
    // Champ absent ou type différent.
  }
}

export function applyVpModificationPerPdfFill(
  form: import("pdf-lib").PDFForm,
  input: VpModificationPdfFillInput
): void {
  const text = buildVpModificationPerOperationText(input);
  if (!text) return;
  setPdfTextField(form, VP_MODIFICATION_PER_OPERATION_TEXT_FIELD, text);
}
